"""
File: test_local_model.py
Mục đích: Script mẫu siêu đơn giản giúp bạn hiểu cách code Python gọi trực tiếp vào
bộ não AI (Ollama Local) và in ra từng chữ (Streaming).
"""
import requests
import json

def chat_with_local_ai(prompt, model="qwen2.5:7b"):
    url = "http://localhost:11434/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True
    }
    
    print(f"\n[Người dùng]: {prompt}")
    print(f"[AI ({model})]: ", end="", flush=True)

    try:
        response = requests.post(url, json=payload, stream=True)
        for line in response.iter_lines():
            if line:
                chunk = json.loads(line.decode('utf-8'))
                print(chunk.get("response", ""), end="", flush=True)
                if chunk.get("done", False):
                    break
        print("\n")
    except requests.exceptions.ConnectionError:
        print("\n[Lỗi]: Không kết nối được tới Ollama. Hãy đảm bảo bạn đã chạy 'ollama serve' hoặc bật ứng dụng Ollama!")

if __name__ == "__main__":
    print("=== TEST KẾT NỐI MÔ HÌNH AI CỤC BỘ ===")
    cau_hoi = "Hãy giới thiệu bản thân và chào một lập trình viên AI bằng tiếng Việt trong 2 câu."
    chat_with_local_ai(cau_hoi)
