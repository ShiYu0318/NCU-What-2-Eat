import csv
import os
import re
import time
from dotenv import load_dotenv
from playwright.sync_api import Page, Browser, sync_playwright
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

db = create_client(
    os.environ['NEXT_PUBLIC_SUPABASE_URL'],
    os.environ['SUPABASE_SERVICE_ROLE_KEY'],
)

DAY_MAP = {
    '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3,
    '星期四': 4, '星期五': 5, '星期六': 6,
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6,
}

def to_price_tier(max_price: int) -> str:
    if max_price >= 400:
        return '$$$'
    if max_price >= 200:
        return '$$'
    return '$'

NAME_SELECTORS = [
    'h1.DUwDvf',
    'h1[class*="fontHeadlineLarge"]',
    'h1[class*="DUwDvf"]',
    'h1',
]

def parse_name(page: Page) -> str:
    for sel in NAME_SELECTORS:
        el = page.query_selector(sel)
        if el:
            text = el.inner_text().strip()
            if text:
                return text
    # fallback：從 title 取店名
    title = page.title()
    for sep in [' - Google', ' – Google']:
        if sep in title:
            return title.split(sep)[0].strip()
    return ''


def parse_address(page: Page) -> str:
    el = page.query_selector('button[data-item-id="address"]')
    if not el:
        return ''
    return (el.get_attribute('aria-label') or '').replace('地址: ', '').strip()


def parse_rating(page: Page) -> float | None:
    # aria-label: 評分
    el = page.query_selector('span[aria-label*="顆星"]')
    if el:
        m = re.search(r'(\d+\.\d+)', el.get_attribute('aria-label') or '')
        if m:
            return float(m.group(1))
    return None


def parse_review_count(page: Page) -> int:
    # 優先找 aria-label 含「評論」的 button/span（N 則評論、N 篇評論）
    for selector in [
        'button[aria-label*="則評論"]',
        'button[aria-label*="篇評論"]',
        'span[aria-label*="則評論"]',
        'span[aria-label*="篇評論"]',
    ]:
        el = page.query_selector(selector)
        if el:
            m = re.search(r'([\d,]+)', el.get_attribute('aria-label') or '')
            if m:
                return int(m.group(1).replace(',', ''))

    # fallback：找 inner text 是「N 則評論」或「(N,NNN)」的短文字元素
    for el in page.query_selector_all('button, span'):
        try:
            txt = el.inner_text().strip()
            if len(txt) > 30:
                continue
            m = re.match(r'^([\d,]+)\s*[則篇]評論$', txt)
            if m:
                return int(m.group(1).replace(',', ''))
            m = re.match(r'^\(([\d,]+)\)$', txt)
            if m:
                return int(m.group(1).replace(',', ''))
        except Exception:
            pass

    return 0


def parse_price_range(page: Page) -> str:
    # div.lyplG：格式「(557)·$1-200」或「$100-200」
    el = page.query_selector('div.lyplG')
    if el:
        m = re.search(r'\$([\d,]+)[–\-]([\d,]+)', el.inner_text())
        if m:
            return to_price_tier(int(m.group(2).replace(',', '')))

    # span.mgr77e：純數字區間
    el = page.query_selector('span.mgr77e')
    if el:
        nums = [int(n.replace(',', '')) for n in re.findall(r'[\d,]+', el.inner_text())]
        if nums:
            return to_price_tier(max(nums))

    # aria-label 含「價格」或「Price」的元素
    for el in page.query_selector_all('[aria-label*="價格"], [aria-label*="Price"]'):
        label = el.get_attribute('aria-label') or ''
        m = re.search(r'\$([\d,]+)[–\-]([\d,]+)', label)
        if m:
            return to_price_tier(int(m.group(2).replace(',', '')))

    return '$'


def parse_hours(page: Page) -> list[dict]:
    hours = []

    # 展開今日
    toggle = page.query_selector('div.OMl5r')
    if not toggle:
        print('[警告] 找不到 hours toggle (div.OMl5r)')
        return hours

    toggle.click()
    time.sleep(1)

    # 展開全週
    weekly_btn = page.query_selector('[aria-label="顯示本週營業時間"]')
    if weekly_btn:
        weekly_btn.click()
    else:
        # 備用：icon class
        weekly_btn = page.query_selector('span.puWIL')
        if weekly_btn:
            weekly_btn.click()

    # 等 table 有 7 行（最多 6 秒）
    try:
        page.wait_for_function(
            'document.querySelectorAll("table.eK4R0e tr").length >= 7',
            timeout=6000,
        )
    except Exception:
        pass

    rows = page.query_selector_all('table.eK4R0e tr')
    print(f'  → hours table rows: {len(rows)}')

    for row in rows:
        day_el = row.query_selector('td.ylH6lf')
        if not day_el:
            continue

        day = DAY_MAP.get(day_el.inner_text().strip())
        if day is None:
            continue

        row_text = row.inner_text()

        # 公休日
        if '休息' in row_text or 'Closed' in row_text:
            hours.append({
                'day_of_week': day,
                'open_time': None,
                'close_time': None,
                'is_closed': True,
            })
            continue

        # 找時段：優先找 li.G8aQO，找不到就 regex 整行
        found = False
        for li in row.query_selector_all('li.G8aQO'):
            m = re.search(r'(\d{1,2}:\d{2})[–\-](\d{1,2}:\d{2})', li.inner_text())
            if m:
                hours.append({
                    'day_of_week': day,
                    'open_time': m.group(1),
                    'close_time': m.group(2),
                    'is_closed': False,
                })
                found = True

        if not found:
            for m in re.finditer(r'(\d{1,2}:\d{2})[–\-](\d{1,2}:\d{2})', row_text):
                hours.append({
                    'day_of_week': day,
                    'open_time': m.group(1),
                    'close_time': m.group(2),
                    'is_closed': False,
                })

    return hours

def scrape(browser: Browser, url: str, area: str) -> dict | None:
    page = browser.new_page(locale='zh-TW')
    try:
        # 用 load 等 JS 執行完，timeout 拉長到 60s
        page.goto(url, wait_until='load', timeout=60000)

        # 等任意 h1 出現（Maps SPA 渲染需要時間）
        try:
            page.wait_for_selector('h1', timeout=30000)
        except Exception:
            pass  # 繼續嘗試，parse_name 有 title fallback

        name = parse_name(page)
        if not name:
            print('[跳過] 無法取得名稱')
            page.close()
            return None

        address = parse_address(page)
        rating = parse_rating(page)
        review_count = parse_review_count(page)
        price_range = parse_price_range(page)
        hours = parse_hours(page)
        final_url = page.url

        page.close()
        return {
            'name': name,
            'area': area,
            'address': address,
            'google_maps': final_url,
            'price_range': price_range,
            'rating': rating,
            'review_count': review_count,
            'images': [],
            'type': [],
            'is_active': True,
            'hours': hours,
        }

    except Exception as e:
        print(f'[錯誤] {e}')
        page.close()
        return None

# DB

def is_duplicate(name: str, address: str) -> bool:
    res = db.table('restaurants').select('id').eq('name', name).eq('address', address).execute()
    return len(res.data) > 0


def insert(data: dict):
    hours = data.pop('hours')
    res = db.table('restaurants').insert(data).execute()
    rid = res.data[0]['id']
    if hours:
        for h in hours:
            h['restaurant_id'] = rid
        db.table('business_hours').insert(hours).execute()
    return rid


def main():
    csv_path = os.path.join(os.path.dirname(__file__), 'data', 'restaurants.csv')
    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = [r for r in csv.reader(f) if r and r[0].startswith('http')]

    print(f'共 {len(rows)} 筆，開始爬取...\n')

    with sync_playwright() as p:
        # 一個 browser 跑所有 URL 省開銷
        browser = p.chromium.launch(headless=True)

        for i, row in enumerate(rows, 1):
            if len(row) < 2:
                continue
            url, area = row[0].strip(), row[1].strip().strip('"')
            print(f'[{i}/{len(rows)}] {area} — {url}')

            data = scrape(browser, url, area)
            # 失敗時 retry 一次
            if data is None:
                print('[重試]')
                time.sleep(3)
                data = scrape(browser, url, area)

            if data:
                name = data['name']
                n_hours = len(data['hours'])
                try:
                    if is_duplicate(name, data.get('address', '')):
                        print(f'[跳過] 重複: {name}\n')
                        continue
                    rid = insert(data)
                    print(f'{name}，{n_hours} 筆營業時間 (id: {rid})\n')
                except Exception as e:
                    print(f'寫入失敗: {e}\n')
            else:
                print('爬取失敗，跳過\n')

            time.sleep(2)

        browser.close()

    print('ALL DONE')


if __name__ == '__main__':
    main()