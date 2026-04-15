import csv
import os
import re
import time
from dotenv import load_dotenv
from playwright.sync_api import Page, sync_playwright
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


def parse_hours(page: Page) -> list[dict]:
    hours = []
    try:
        page.wait_for_selector('div.OMl5r', timeout=5000)
    except:
        return hours

    # 點開完整一週，預設只顯示今天
    toggle = page.query_selector('div.OMl5r')
    if not toggle:
        return hours

    toggle.click()
    time.sleep(1)

    # 點一下可能是收合，再試一次確保展開
    if len(page.query_selector_all('table.eK4R0e tr')) < 7:
        toggle.click()
        time.sleep(1)

    for row in page.query_selector_all('table.eK4R0e tr'):
        day_el = row.query_selector('td.ylH6lf')
        time_el = row.query_selector('td.mxowUb')
        if not day_el or not time_el:
            continue

        day = DAY_MAP.get(day_el.inner_text().strip())
        if day is None:
            continue

        aria = time_el.get_attribute('aria-label') or ''

        if '休息' in aria or 'Closed' in aria:
            hours.append({'day_of_week': day, 'open_time': None, 'close_time': None, 'is_closed': True})
            continue

        # 一天可能有多個時段
        for li in row.query_selector_all('li.G8aQO'):
            m = re.search(r'(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})', li.inner_text())
            if m:
                hours.append({
                    'day_of_week': day,
                    'open_time': m.group(1) + ':00',
                    'close_time': m.group(2) + ':00',
                    'is_closed': False,
                })

    return hours


def parse_menu_images(page: Page) -> list[str]:
    images = []
    try:
        # 封面圖按鈕進相片頁
        btn = page.query_selector('button[jsaction*="heroHeaderImage"]')
        if not btn:
            return images

        btn.click()
        time.sleep(1)

        # 找菜單分頁
        menu_tab = next(
            (t for t in page.query_selector_all('div[role="tab"]')
            if '菜單' in t.inner_text() or 'Menu' in t.inner_text()),
            None
        )
        if not menu_tab:
            page.go_back()
            return images

        menu_tab.click()
        time.sleep(1)

        for img in page.query_selector_all('img.Uf0tqf')[:10]:
            src = img.get_attribute('src') or ''
            if src.startswith('http'):
                src = re.sub(r'=w\d+-h\d+.*$', '=w800-h600', src)
                images.append(src)

        page.go_back()
        time.sleep(1)
    except Exception as e:
        print(f'[警告] 菜單照片失敗: {e}')

    return images


def scrape(url: str, area: str) -> dict | None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until='domcontentloaded', timeout=30000)
            page.wait_for_selector('h1.DUwDvf', timeout=10000)

            name = ''
            el = page.query_selector('h1.DUwDvf')
            if el:
                name = el.inner_text().strip()
            if not name:
                print(f'[跳過] 無法取得名稱')
                browser.close()
                return None

            # 地址
            address = ''
            el = page.query_selector('button[data-item-id="address"]')
            if el:
                address = (el.get_attribute('aria-label') or '').replace('地址: ', '').strip()

            # 評分（div.F7nice 第一個 aria-hidden span）
            rating = None
            el = page.query_selector('div.F7nice span[aria-hidden="true"]')
            if el:
                try:
                    rating = float(el.inner_text().strip())
                except ValueError:
                    pass

            # 評論數 & 價位
            # lyplG: (557)·$1-200
            review_count = 0
            price_range = '$'
            lyplg = page.query_selector('div.lyplG')
            if lyplg:
                lyplg_text = lyplg.inner_text().strip()
                # 評論數：(N) 或 (N,NNN)
                m = re.search(r'\(([\d,]+)\)', lyplg_text)
                if m:
                    review_count = int(m.group(1).replace(',', ''))
                # 價格區間：$X-Y 或 $X–Y，取最大值決定等級
                m = re.search(r'\$([\d,]+)[–\-]([\d,]+)', lyplg_text)
                if m:
                    max_price = int(m.group(2).replace(',', ''))
                    price_range = '$$$' if max_price >= 500 else '$$' if max_price >= 200 else '$'

            # fallback：評論數從「N 篇/則評論」按鈕取得
            if review_count == 0:
                for btn in page.query_selector_all('button'):
                    txt = btn.inner_text().strip()
                    m = re.match(r'^([\d,]+)\s*[則篇]評論$', txt)
                    if m:
                        review_count = int(m.group(1).replace(',', ''))
                        break

            # fallback：價格從 span.mgr77e 取得，取區間最大值
            if price_range == '$':
                el = page.query_selector('span.mgr77e')
                if el:
                    text = el.inner_text()
                    nums = [int(n.replace(',', '')) for n in re.findall(r'[\d,]+', text)]
                    if nums:
                        max_price = max(nums)
                        price_range = '$$$' if max_price >= 500 else '$$' if max_price >= 200 else '$'

            # 營業時間要在導航前抓，不然 page context 會壞掉
            hours = parse_hours(page)
            images = parse_menu_images(page)
            final_url = page.url

            browser.close()
            return {
                'name': name,
                'area': area,
                'address': address,
                'google_maps': final_url,
                'price_range': price_range,
                'rating': rating,
                'review_count': review_count,
                'images': images,
                'type': [],
                'is_active': True,
                'hours': hours,
            }

        except Exception as e:
            print(f'[錯誤] {e}')
            browser.close()
            return None


def is_duplicate(name: str, address: str) -> bool:
    # 同名同地址視為重複
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

    for i, row in enumerate(rows, 1):
        if len(row) < 2:
            continue
        url, area = row[0].strip(), row[1].strip().strip('"')
        print(f'[{i}/{len(rows)}] {area} - {url}')

        data = scrape(url, area)
        if data:
            try:
                if is_duplicate(data['name'], data.get('address', '')):
                    print(f'[跳過] 重複: {data["name"]}\n')
                    continue
                rid = insert(data)
                print(f'{data["name"]} (id: {rid})\n')
            except Exception as e:
                print(f'寫入失敗: {e}\n')
        else:
            print(f'爬取失敗，跳過\n')

        time.sleep(1)

    print('ALL DONE')


if __name__ == '__main__':
    main()