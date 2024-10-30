from citation_map import generate_citation_map
from playwright.sync_api import sync_playwright
import time
import os

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
        # 生成引用图
        scholar_id = '2z4sraUAAAAJ'
        generate_citation_map(scholar_id)
        print("Citation map HTML generated successfully")  # 调试信息
        
        # 截图保存
        capture_citation_map()
        print("Screenshot captured successfully")  # 调试信息
        
    except Exception as e:
        print(f"Error in main: {str(e)}")
        raise

if __name__ == "__main__":
    main()