import Image from "next/image";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === "admin@localhost" && password === "admin") {
      window.location.href = "/dashboard";
    } else {
      setError("Credenciales incorrectas");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#181A20] via-[#23262F] to-[#181A20] relative overflow-hidden">
      {/* Fondo decorativo blur y líneas */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute left-1/2 top-0 w-[60vw] h-[100vh] bg-gradient-to-br from-[#23262F] to-transparent opacity-60 blur-2xl" style={{transform:'translateX(-30%)'}} />
        <div className="absolute right-0 top-0 w-[40vw] h-[100vh] bg-gradient-to-tl from-[#23262F] to-transparent opacity-40 blur-2xl" />
      </div>
      <div className="absolute top-6 left-8 z-20">
        <span className="font-spacehabitat text-white tracking-widest select-none" style={{ fontSize: '20px', background: 'linear-gradient(90deg, #70F6F7, #7BFF08)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Tezcapanel</span>
      </div>
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-0 md:gap-16 w-full max-w-5xl p-4">
        {/* Panel lateral de bienvenida y registro */}
        <div className="hidden md:flex flex-1 flex-col items-center justify-center order-1 md:order-none p-10 mr-0 md:mr-4 min-h-[420px]">
          <h2 className="text-3xl font-bold text-white mb-2 text-center font-poppins" style={{ fontSize:'35px', fontWeight: 400, fontFamily: 'Poppins, sans-serif'}}>Bienvenido de vuelta</h2>
          <p className="text-gray-300 text-base text-center font-poppins mb-12" style={{ marginTop: '20px' }}>Inicia sesión para que empieces a administrar los recursos de forma rápida y sencilla.</p>
          <div className="mt-12" style={{ marginTop: '50px' }} />
          <p className="text-white text-center font-poppins mb-3">¿No tienes una cuenta?</p>
          <button
            type="button"
            className="w-full py-3 rounded-lg font-bold text-[#181A20] text-lg hover:scale-105 transition-transform shadow font-spacehabitat"
            style={{ backgroundColor: '#70F6F7' }}
            onClick={() => window.location.href = '/login/register'}
          >
            Registro
          </button>
        </div>
        {/* Panel login */}
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-10 flex flex-col gap-6 order-2 md:order-none"
        >
          <h1 className="text-2xl font-normal text-white mb-2 text-left tracking-wider font-poppins"
            style={{ fontFamily: 'Poppins, sans-serif', fontSize: '35px', textAlign: 'center', fontWeight: 400 }}
          >
            Login
          </h1>
          <div>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#70F6F7] transition-all"
              required
              autoComplete="username"
              placeholder="Ingresa tu correo"
            />
          </div>
          <div>
           <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#70F6F7] transition-all"
              required
              autoComplete="current-password"
              placeholder="Ingresa tu contraseña"
            />
          </div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-gray-300 text-sm font-poppins cursor-pointer">
              <input type="checkbox" className="accent-[#70F6F7] w-4 h-4 rounded" />
              Recuérdame
            </label>
            <button type="button" className="text-xs text-[#70F6F7] hover:underline font-poppins focus:outline-none bg-transparent">¿No recuerdas tu contraseña?</button>
          </div>
          {error && <div className="text-pink-400 text-sm text-left animate-pulse font-poppins">{error}</div>}
          <button
            type="submit"
            className="mt-2 w-full py-3 rounded-lg font-bold text-[#181A20] text-lg bg-gradient-to-r from-[#70F6F7] to-[#7BFF08] hover:scale-105 transition-transform shadow font-spacehabitat"
          >
            Acceder
          </button>
        </form>
      </div>
    </div>
  );
}
