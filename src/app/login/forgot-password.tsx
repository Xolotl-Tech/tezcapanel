"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#181A20] via-[#23262F] to-[#181A20] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute left-1/2 top-0 w-[60vw] h-[100vh] bg-gradient-to-br from-[#23262F] to-transparent opacity-60 blur-2xl" style={{transform:'translateX(-30%)'}} />
        <div className="absolute right-0 top-0 w-[40vw] h-[100vh] bg-gradient-to-tl from-[#23262F] to-transparent opacity-40 blur-2xl" />
      </div>
      <div className="absolute top-6 left-8 z-20">
        <span className="font-spacehabitat text-white tracking-widest select-none" style={{ fontSize: '20px', background: 'linear-gradient(90deg, #70F6F7, #7BFF08)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Tezcapanel</span>
      </div>
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-1/2 max-w-lg bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-10 flex flex-col gap-6"
      >
        <h1 className="text-2xl font-normal text-white mb-2 text-left tracking-wider font-poppins"
          style={{ fontFamily: 'Poppins, sans-serif', fontSize: '32px', textAlign: 'center', fontWeight: 400 }}
        >
          Recuperar contraseña
        </h1>
        {sent ? (
          <div className="text-[#70F6F7] text-center font-poppins">
            Si el correo existe, recibirás instrucciones para restablecer tu contraseña.
          </div>
        ) : (
          <>
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
            <div className="flex gap-2 mt-2">
                <button
                type="button"
                className="flex-1 min-w-0 py-3 rounded-lg font-bold text-[#181A20] text-base bg-[#70F6F7] hover:scale-105 transition-transform shadow font-spacehabitat"
                style={{ fontSize: '12px', backgroundColor: '#70F6F7'}}
                onClick={() => window.location.href = '/login'}
              >
                Regresar
              </button>
              <button
                type="submit"
                className="flex-1 min-w-0 py-3 rounded-lg font-bold text-[#181A20] text-base bg-gradient-to-r from-[#70F6F7] to-[#7BFF08] hover:scale-105 transition-transform shadow font-spacehabitat"
                style={{ fontSize: '12px'}}
              >
                Enviar instrucciones
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
