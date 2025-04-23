from citation_map import generate_citation_map
from playwright.sync_api import sync_playwright
import time
import os
import random
from scholarly import ProxyGenerator, scholarly
import logging
import sys
import ssl
import urllib3
import requests

# 配置日志
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 禁用SSL警告（在生产环境中不建议，但在这种特定情况下可能是必要的）
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def setup_proxy_and_ssl():
    """设置代理并处理SSL证书问题"""
    try:
        # 1. 创建自定义SSL上下文
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        # 2. 修改scholarly的HTTP客户端以使用此SSL上下文
        # 注意：这部分代码可能需要根据scholarly库的内部实现调整
        try:
            # 尝试为scholarly模块的内部HTTP客户端设置SSL上下文
            # 这取决于scholarly库的实现，可能需要调整
            scholarly._navigator._get_page_session.verify = False
        except:
            logger.warning("Could not directly modify scholarly's SSL settings. Using environment variables instead.")
        
        # 3. 设置环境变量以禁用Python的证书验证
        os.environ['PYTHONHTTPSVERIFY'] = '0'
        
        # 4. 设置requests库的SSL验证为False（如果scholarly内部使用requests）
        try:
            # 这是一种尝试，可能不会直接影响scholarly
            requests.packages.urllib3.disable_warnings()
            session = requests.Session()
            session.verify = False
        except:
            logger.warning("Could not modify requests session settings")
            
        # 5. 尝试常规代理设置
        pg = ProxyGenerator()
        logger.info("Trying to use free proxies...")
        if pg.FreeProxies():
            scholarly.use_proxy(pg)
            return True
            
        logger.warning("Failed to setup proxy")
        return False
        
    except Exception as e:
        logger.error(f"Error setting up proxy and SSL: {str(e)}")
        return False

def generate_citation_map_with_retry(scholar_id, max_attempts=3):
    """带重试机制的引用图生成"""
    # 设置请求间的随机延迟（3-7秒）
    try:
        # 尝试设置超时，如果方法存在的话
        if hasattr(scholarly, 'set_timeout'):
            scholarly.set_timeout(random.uniform(3, 7))
    except Exception as e:
        logger.warning(f"Could not set timeout: {str(e)}")
    
    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(f"Attempt {attempt}/{max_attempts}: Generating citation map for scholar ID: {scholar_id}")
            
            # 尝试直接修改环境中的SSL设置
            # 这是在每次尝试之前重新设置，以防设置被重置
            old_https_verify = os.environ.get('PYTHONHTTPSVERIFY', '1')
            os.environ['PYTHONHTTPSVERIFY'] = '0'
            
            # 创建自定义 SSLContext
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            # 执行引用图生成
            result = generate_citation_map(scholar_id)
            
            # 恢复原始设置
            os.environ['PYTHONHTTPSVERIFY'] = old_https_verify
            
            logger.info("Citation map generation successful")
            return result
            
        except Exception as e:
            logger.warning(f"Attempt {attempt} failed: {str(e)}")
            if attempt < max_attempts:
                # 在重试之前等待的时间随着尝试次数增加而增加
                wait_time = random.uniform(4, 10) * attempt
                logger.info(f"Waiting {wait_time:.2f} seconds before next attempt...")
                time.sleep(wait_time)
                
                # 在重试前重新设置代理
                logger.info("Resetting proxy for next attempt...")
                setup_proxy_and_ssl()
            else:
                logger.error("All attempts failed")
                raise

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
            
            # 检查文件是否存在
            if not os.path.exists(html_path):
                logger.error(f"HTML file not found at: {html_path}")
                # 创建一个简单的HTML文件，以便能够继续生成截图
                with open(html_path, 'w') as f:
                    f.write('<html><body><h1>Citation Map Generation Failed</h1><p>Could not fetch data from Google Scholar.</p></body></html>')
                logger.info(f"Created placeholder HTML file at: {html_path}")
            
            # 加载本地HTML文件
            page.goto(file_url)
            
            # 等待可视化完全加载
            logger.info("Waiting for visualization to load...")
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

def create_dummy_citation_map():
    """创建一个假的引用图HTML文件，以便在无法从Google Scholar获取数据时使用"""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        html_path = os.path.join(current_dir, 'citation_map.html')
        
        html_content = '''
        <!DOCTYPE html>
        <html>
        <head>
            <title>Citation Map (Temporarily Unavailable)</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
                h1 { color: #333; }
                p { color: #666; line-height: 1.6; }
                .error { color: #cc0000; }
                .info { color: #0066cc; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Citation Map</h1>
                <p class="error">Temporarily unavailable due to connection issues with Google Scholar.</p>
                <p class="info">The system encountered SSL certificate verification errors when trying to access Google Scholar. This is a temporary issue that may be resolved in future runs.</p>
                <p>Last attempted: ''' + time.strftime("%Y-%m-%d %H:%M:%S") + '''</p>
                <p>The citation map will be automatically updated when Google Scholar becomes accessible again.</p>
            </div>
        </body>
        </html>
        '''
        
        with open(html_path, 'w') as f:
            f.write(html_content)
            
        logger.info(f"Created dummy citation map HTML at: {html_path}")
        return html_path
    except Exception as e:
        logger.error(f"Error creating dummy citation map: {str(e)}")
        raise

def main():
    try:
        # 设置代理和SSL
        setup_proxy_and_ssl()
        
        try:
            # 生成引用图
            scholar_id = '2z4sraUAAAAJ'
            generate_citation_map_with_retry(scholar_id)
            logger.info("Citation map HTML generated successfully")
        except Exception as e:
            logger.error(f"Failed to generate citation map: {str(e)}")
            # 创建一个假的引用图HTML文件
            create_dummy_citation_map()
            logger.info("Created dummy citation map instead")
        
        # 无论如何都尝试截图
        capture_citation_map()
        logger.info("Process completed")
        
    except Exception as e:
        logger.error(f"Error in main process: {str(e)}")
        sys.exit(1)  # 确保在出错时脚本返回非零退出码

if __name__ == "__main__":
    main()
