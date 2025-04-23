from citation_map import generate_citation_map
from playwright.sync_api import sync_playwright
import time
import os
import random
from scholarly import ProxyGenerator, scholarly
import logging
from tenacity import retry, stop_after_attempt, wait_random_exponential

# 配置日志
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def setup_proxy():
    """设置并尝试多种代理方法"""
    pg = ProxyGenerator()
    
    # 尝试方法1：免费代理
    logger.info("Trying to use free proxies...")
    if pg.FreeProxies():
        scholarly.use_proxy(pg)
        return True
        
    # 尝试方法2：Tor代理（如果可用）
    logger.info("Free proxies failed, trying Tor...")
    try:
        if pg.Tor_External(tor_sock_port=9050, tor_control_port=9051):
            scholarly.use_proxy(pg)
            return True
    except Exception as e:
        logger.warning(f"Tor proxy failed: {e}")
    
    # 尝试方法3：使用系统代理（如果配置了环境变量）
    logger.info("Trying system proxy...")
    if pg.Use_IP_Pool(file_path=None):
        scholarly.use_proxy(pg)
        return True
        
    logger.warning("All proxy methods failed")
    return False

@retry(stop=stop_after_attempt(3), wait=wait_random_exponential(multiplier=1, min=4, max=10))
def generate_citation_map_with_retry(scholar_id):
    """带重试机制的引用图生成"""
    # 设置请求间的随机延迟（3-7秒）
    scholarly.set_timeout(random.uniform(3, 7))
    
    # 设置用户代理头，模拟不同的浏览器
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36"
    ]
    scholarly.set_user_agent(random.choice(user_agents))
    
    logger.info(f"Generating citation map for scholar ID: {scholar_id}")
    return generate_citation_map(scholar_id)

def capture_citation_map():
    """使用Playwright捕获引用图的截图"""
    try:
        with sync_playwright() as p:
            logger.info("Launching browser for screenshot...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # 设置视窗大小 - 增加尺寸以便更好捕获
            page.set_viewport_size({"width": 1200, "height": 800})
            
            # 获取当前文件的绝对路径
            current_dir = os.path.dirname(os.path.abspath(__file__))
            html_path = os.path.join(current_dir, 'citation_map.html')
            file_url = f'file://{html_path}'
            
            logger.info(f"Loading HTML from: {file_url}")
            
            # 加载本地HTML文件
            page.goto(file_url)
            
            # 等待可视化完全加载（动态等待）
            logger.info("Waiting for visualization to load...")
            # 添加适当的等待条件，如果HTML有特定元素可以等待
            page.wait_for_timeout(8000)  # 等待8秒以确保加载完成
            
            # 确保输出目录存在
            screenshot_path = os.path.join(current_dir, 'citation_map.png')
            os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
            
            # 截图
            logger.info("Taking screenshot...")
            page.screenshot(path=screenshot_path)
            logger.info(f"Screenshot saved to: {screenshot_path}")
            
            # 关闭浏览器
            browser.close()
            return True
            
    except Exception as e:
        logger.error(f"Error during screenshot capture: {str(e)}")
        raise

def main():
    try:
        # 设置代理
        if not setup_proxy():
            logger.warning("Proceeding without proxy, which may limit success rate")
        
        # 生成引用图
        scholar_id = '2z4sraUAAAAJ'
        generate_citation_map_with_retry(scholar_id)
        logger.info("Citation map HTML generated successfully")
        
        # 截图保存
        capture_citation_map()
        logger.info("Process completed successfully")
        
    except Exception as e:
        logger.error(f"Error in main process: {str(e)}")
        raise

if __name__ == "__main__":
    main()
