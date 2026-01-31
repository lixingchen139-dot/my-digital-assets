"use client";

import { useState, useEffect, useRef } from "react";

interface Asset {
  id: number;
  title: string;
  file_url: string;
  type: string;
}

export default function Home() {
  // --- 状态管理 ---
  const [serverStatus, setServerStatus] = useState("检查连接...");
  const [isOnline, setIsOnline] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  
  // 🔐 登录相关状态
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null); // 'user' 或 'admin'
  const [username, setUsername] = useState<string>("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  // 📤 上传与预览状态
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 初始化检查 ---
  useEffect(() => {
    // 1. 检查后端
    fetch("http://localhost:8000/")
      .then(() => {
        setServerStatus("系统正常");
        setIsOnline(true);
      })
      .catch(() => {
        setServerStatus("后端离线");
        setIsOnline(false);
      });

    // 2. 加载资产列表
    fetchAssets();

    // 3. 检查有没有旧的登录记录 (可选优化)
    const savedToken = localStorage.getItem("token");
    const savedRole = localStorage.getItem("role");
    const savedUser = localStorage.getItem("username");
    if (savedToken) {
      setToken(savedToken);
      setRole(savedRole);
      setUsername(savedUser || "");
    }
  }, []);

  const fetchAssets = () => {
    fetch("http://localhost:8000/assets/")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAssets(data);
      })
      .catch((err) => console.error("获取失败:", err));
  };

  // --- 🔑 登录逻辑 ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // 阻止表单刷新
    
    // 发送表单数据 (x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append("username", loginForm.username);
    formData.append("password", loginForm.password);

    try {
      const res = await fetch("http://localhost:8000/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (!res.ok) {
        alert("登录失败：用户名或密码错误");
        return;
      }

      const data = await res.json();
      // 登录成功！保存数据
      setToken(data.access_token);
      setRole(data.role);
      setUsername(loginForm.username);
      
      // 存到浏览器里，下次刷新还在
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", loginForm.username);

      setShowLoginModal(false); // 关闭弹窗
      alert(`欢迎回来，${data.role === 'admin' ? '管理员' : '用户'} ${loginForm.username}！`);
    } catch (err) {
      console.error(err);
      alert("登录出错，请检查后端");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setRole(null);
    setUsername("");
    localStorage.clear();
  };

  // --- 📤 上传逻辑 (带 Token) ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    // 安全检查：虽然按钮隐藏了，但再防一手
    if (role !== 'admin') {
      alert("权限不足：只有管理员可以上传！");
      return;
    }

    const file = e.target.files[0];
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8000/upload/", {
        method: "POST",
        headers: {
          // 👇 关键：带着令牌去上传！
          "Authorization": `Bearer ${token}` 
        },
        body: formData,
      });

      if (res.ok) {
        fetchAssets(); // 刷新列表
        alert("✅ 上传成功！");
      } else {
        const err = await res.json();
        alert(`❌ 上传失败: ${err.detail}`);
      }
    } catch (error) {
      console.error(error);
      alert("上传出错");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-100 font-sans selection:bg-blue-500/30">
      
      {/* --- 导航栏 --- */}
      <nav className="fixed top-0 w-full z-40 border-b border-white/10 bg-[#0A0A0B]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              LIXINGCHEN.DEV
            </div>
            {/* 状态灯 */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${isOnline ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
               <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
               {serverStatus}
            </div>
          </div>

          {/* 右侧登录/用户信息区 */}
          <div>
            {token ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">
                  {role === 'admin' ? '👑' : '👤'} {username}
                </span>
                <button 
                  onClick={handleLogout}
                  className="text-xs px-3 py-1.5 border border-white/20 rounded hover:bg-white/10 transition"
                >
                  退出
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowLoginModal(true)}
                className="bg-white text-black px-4 py-1.5 text-sm font-bold rounded-full hover:bg-gray-200 transition"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* --- Hero 区域 --- */}
      <main className="flex flex-col items-center justify-center pt-32 pb-10 px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 text-white">
          我的数字资产库
        </h1>
        <p className="text-gray-400 text-lg mb-8 font-mono">
          当前已存储 {assets.length} 个文件
        </p>

        {/* 👇 权限控制：只有 Admin 才能看到上传按钮 👇 */}
        {role === 'admin' ? (
          <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />
            <button 
              disabled={!isOnline || isUploading}
              onClick={() => fileInputRef.current?.click()}
              className={`
                px-8 py-3 rounded-full font-medium transition-all transform hover:scale-105 active:scale-95
                ${isUploading ? "bg-gray-700 cursor-wait" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30"}
              `}
            >
              {isUploading ? "正在上传..." : "🚀 上传新资产"}
            </button>
          </div>
        ) : (
          <div className="text-gray-500 text-sm bg-white/5 px-4 py-2 rounded-lg border border-white/5">
             🔒 登录管理员账号以管理资产
          </div>
        )}
      </main>

      {/* --- 资产列表 --- */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        {assets.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl bg-white/5">
            <p className="text-gray-400 text-xl">📭 还没有资产</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {assets.map((item) => (
              <div key={item.id} className="group relative bg-[#121212] border border-white/5 rounded-xl overflow-hidden hover:border-blue-500/50 transition-all">
                <div className="aspect-video w-full bg-gray-900 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.file_url} alt={item.title} className="object-cover w-full h-full" />
                  <div 
                    onClick={() => setPreviewImage(item.file_url)} 
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  >
                    <span className="px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-gray-200">
                      👀 预览
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-white font-medium truncate text-sm" title={item.title}>{item.title}</h3>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500 uppercase">{item.type}</span>
                    <span className="text-xs text-blue-500">#{item.id}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- 💡 灯箱预览 --- */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <button className="absolute top-6 right-6 text-white/50 hover:text-white p-2">✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* --- 🔑 登录弹窗 (Modal) --- */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#18181b] border border-white/10 p-8 rounded-2xl w-full max-w-sm shadow-2xl relative">
            <button 
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
            >
              ✕
            </button>
            
            <h2 className="text-2xl font-bold text-white mb-6 text-center">登录系统</h2>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">用户名</label>
                <input 
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition"
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">密码</label>
                <input 
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition"
                  placeholder="••••••"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition mt-4"
              >
                进入系统
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}