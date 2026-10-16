from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import subprocess
import os

class SaveHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        # ===== 保存数据（录入页面调用） =====
        if self.path == '/save-data':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            with open('data/prices.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        
        # ===== 一键更新：运行 fetch_prices.py =====
        elif self.path == '/run-fetch':
            try:
                # 获取当前脚本所在目录
                script_dir = os.path.dirname(os.path.abspath(__file__))
                fetch_script = os.path.join(script_dir, 'fetch_prices.py')
                
                # 检查 fetch_prices.py 是否存在
                if not os.path.exists(fetch_script):
                    response = {'success': False, 'message': 'fetch_prices.py 文件不存在'}
                else:
                    # 运行 fetch_prices.py
                    result = subprocess.run(
                        ['python', fetch_script],
                        cwd=script_dir,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                    if result.returncode == 0:
                        response = {'success': True, 'message': '价格更新成功'}
                    else:
                        response = {'success': False, 'message': result.stderr or result.stdout}
            except subprocess.TimeoutExpired:
                response = {'success': False, 'message': '执行超时（60秒）'}
            except Exception as e:
                response = {'success': False, 'message': str(e)}
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
        
        # ===== 获取最新价格（直接返回JSON） =====
        elif self.path == '/fetch-prices':
            try:
                # 导入获取价格的函数
                import importlib.util
                script_dir = os.path.dirname(os.path.abspath(__file__))
                fetch_script = os.path.join(script_dir, 'fetch_prices.py')
                
                # 动态加载 fetch_prices 模块
                spec = importlib.util.spec_from_file_location("fetch_prices", fetch_script)
                fetch_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(fetch_module)
                
                prices = fetch_module.fetch_etf_prices()
                if prices:
                    response = {'success': True, 'prices': prices}
                else:
                    response = {'success': False, 'error': '获取价格失败，请检查网络'}
            except Exception as e:
                response = {'success': False, 'error': str(e)}
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
        
        else:
            super().do_POST()

if __name__ == '__main__':
    port = 8080
    print(f'🚀 服务器启动在 http://localhost:{port}')
    print('📊 访问 http://localhost:8080/data_entry.html 录入数据')
    print('📱 手机访问: http://你的IP:8080/data_entry.html')
    print('⚡ 支持一键更新功能')
    HTTPServer(('0.0.0.0', port), SaveHandler).serve_forever()