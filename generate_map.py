import multiprocessing as mp
# macOS default start_method is 'spawn'; workers would re-import scholarly
# fresh and lose the proxy set on the main process. Force fork so workers
# inherit ProxyGenerator state.
mp.set_start_method('fork', force=True)

from citation_map import generate_citation_map
import citation_map.citation_map as _cm
from playwright.sync_api import sync_playwright
from scholarly import scholarly, ProxyGenerator
import time
import os


def setup_scholar_proxy():
    """Route scholarly through free proxies — Google Scholar blocks
    datacenter / Cybever IPs, direct queries return MaxTriesExceeded."""
    pg = ProxyGenerator()
    if not pg.FreeProxies():
        raise RuntimeError("FreeProxies setup failed")
    scholarly.use_proxy(pg)
    print("Scholar proxy: FreeProxies enabled")


def patch_citation_map():
    """citation_map crashes the whole pool when any single Scholar query
    returns a CAPTCHA / malformed page (NoneType .get on missing canonical
    link). Swallow per-task errors so the run completes."""
    _orig_agg = _cm.__affiliations_from_authors_aggressive
    _orig_con = _cm.__affiliations_from_authors_conservative

    def _safe(orig):
        def wrapper(info):
            try:
                return orig(info)
            except Exception:
                return None
        wrapper.__module__ = orig.__module__
        wrapper.__qualname__ = orig.__qualname__
        wrapper.__name__ = orig.__name__
        return wrapper

    _cm.__affiliations_from_authors_aggressive = _safe(_orig_agg)
    _cm.__affiliations_from_authors_conservative = _safe(_orig_con)
    print("citation_map: per-task error handlers installed")

def capture_citation_map():
    try:
        with sync_playwright() as p:
            # 使用无头模式启动浏览器（特别重要，因为GitHub Actions没有GUI）
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # 设置视窗大小
            page.set_viewport_size({"width": 800, "height": 600})
            
            # 获取当前文件的绝对路径
            current_dir = os.path.dirname(os.path.abspath(__file__))
            html_path = os.path.join(current_dir, 'citation_map.html')
            file_url = f'file://{html_path}'
            
            print(f"Trying to load: {file_url}")  # 调试信息
            
            # 加载本地HTML文件
            page.goto(file_url)
            
            # 等待可视化完全加载（增加等待时间）
            time.sleep(5)
            
            # 确保输出目录存在
            screenshot_path = os.path.join(current_dir, 'citation_map.png')
            os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
            
            # 截图
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to: {screenshot_path}")  # 调试信息
            
            # 关闭浏览器
            browser.close()
            
    except Exception as e:
        print(f"Error during screenshot capture: {str(e)}")
        raise

def main():
    try:
        setup_scholar_proxy()
        patch_citation_map()

        # 生成引用图
        scholar_id = '2z4sraUAAAAJ'
        generate_citation_map(scholar_id)
        print("Citation map HTML generated successfully")

        # 截图保存
        capture_citation_map()
        print("Screenshot captured successfully")

    except Exception as e:
        print(f"Error in main: {str(e)}")
        raise


if __name__ == "__main__":
    main()
