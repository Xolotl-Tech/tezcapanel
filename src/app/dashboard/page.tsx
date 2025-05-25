"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDominiosDropdown, setShowDominiosDropdown] = useState(false);

  return (
    <div className="min-h-screen h-screen flex flex-row bg-gradient-to-br from-[#181A20] via-[#23262F] to-[#181A20]">
      {/* Slide menu */}
      <aside className={`fixed md:relative top-0 left-0 h-screen w-64 bg-[#23262F] shadow-2xl z-40 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 md:translate-x-0 md:flex md:flex-col md:w-64 md:min-h-screen md:bg-[#23262F] md:shadow-none md:z-0`}>
        {/* Logo Tezcapanel */}
        <div className="flex items-center justify-center mt-8 mb-4">
                <span className="font-spacehabitat text-white tracking-widest select-none" style={{ fontSize: '20px', background: 'linear-gradient(90deg, #70F6F7, #7BFF08)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Tezcapanel</span>
        </div>
        <nav className="flex flex-col gap-2 px-4">
          {/* Dashboard */}
          <a href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-semibold transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="11" width="7" height="9" rx="2" stroke="#70F6F7" strokeWidth="2"/><rect x="14" y="3" width="7" height="17" rx="2" stroke="#7BFF08" strokeWidth="2"/></svg>
            Dashboard
          </a>
          {/* Sitios web: globo terráqueo */}
          <a href="#apps" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#70F6F7" strokeWidth="2"/><path stroke="#7BFF08" strokeWidth="2" d="M2.5 12h19M12 2.5c2.5 2.5 2.5 16.5 0 19M12 2.5c-2.5 2.5-2.5 16.5 0 19"/></svg>
            Sitios web
          </a>
          {/* Dominios: dropdown desplegable inline */}
          <div className="w-full">
            <button type="button" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors w-full focus:outline-none" onClick={() => setShowDominiosDropdown(v => !v)}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path stroke="#70F6F7" strokeWidth="2" d="M7.5 12a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 1 1 0 9h-2"/><path stroke="#7BFF08" strokeWidth="2" d="M16.5 12a4.5 4.5 0 0 0-4.5-4.5h-2a4.5 4.5 0 1 0 0 9h2"/></svg>
              Dominios
              <svg className={`ml-auto transition-transform ${showDominiosDropdown ? 'rotate-180' : ''}`} width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="#70F6F7" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            {showDominiosDropdown && (
              <div className="flex flex-col w-full bg-[#23262F] rounded-b-lg shadow-inner border-t border-white/10 animate-fadeIn">
                <a href="#mis-dominios" className="flex items-center gap-2 px-6 py-2 text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] transition-colors">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#70F6F7" strokeWidth="2"/><path stroke="#7BFF08" strokeWidth="2" d="M2.5 12h19"/></svg>
                  Mis dominios
                </a>
                <a href="#nuevo-dominio" className="flex items-center gap-2 px-6 py-2 text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] transition-colors">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#7BFF08" strokeWidth="2" strokeLinecap="round"/></svg>
                  Obtener nuevo dominio
                </a>
                <a href="#transferencias" className="flex items-center gap-2 px-6 py-2 text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] rounded-b-lg transition-colors">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M17 8l4 4-4 4M7 16l-4-4 4-4" stroke="#70F6F7" strokeWidth="2" strokeLinecap="round"/><rect x="7" y="11" width="10" height="2" rx="1" fill="#7BFF08"/></svg>
                  Transferencias
                </a>
              </div>
            )}
          </div>
          {/* Emails: sobre/correo */}
          <a href="#servidores" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" stroke="#70F6F7" strokeWidth="2"/><path stroke="#7BFF08" strokeWidth="2" d="M3 7l9 7 9-7"/></svg>
            Emails
          </a>
          {/* FTP: nube */}
          <a href="#ftp" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M7 18a5 5 0 1 1 2-9.7A7 7 0 1 1 19 17" stroke="#70F6F7" strokeWidth="2"/><path d="M9 18h6" stroke="#7BFF08" strokeWidth="2" strokeLinecap="round"/></svg>
            FTP
          </a>
          {/* Bases de datos: base de datos */}
          <a href="#db" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><ellipse cx="12" cy="7" rx="8" ry="3" stroke="#70F6F7" strokeWidth="2"/><path d="M4 7v7c0 1.66 3.58 3 8 3s8-1.34 8-3V7" stroke="#7BFF08" strokeWidth="2"/><path d="M4 14c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke="#70F6F7" strokeWidth="2"/></svg>
            Bases de datos
          </a>
          {/* Usuarios: usuario */}
          <a href="#usuarios" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="#70F6F7" strokeWidth="2"/><path d="M4 20c0-3.31 3.58-6 8-6s8 2.69 8 6" stroke="#7BFF08" strokeWidth="2"/></svg>
            Usuarios
          </a>
          {/* Marketplace: bolsa */}
          <a href="#marketplace" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="11" rx="3" stroke="#70F6F7" strokeWidth="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2" stroke="#7BFF08" strokeWidth="2"/><path d="M9 12h6" stroke="#7BFF08" strokeWidth="2" strokeLinecap="round"/></svg>
            Marketplace
          </a>
          {/* Facturación: tarjeta bancaria */}
          <a href="#facturacion" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#70F6F7] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" stroke="#70F6F7" strokeWidth="2"/><rect x="7" y="14" width="6" height="2" rx="1" fill="#7BFF08"/><path stroke="#7BFF08" strokeWidth="2" d="M3 10h18"/></svg>
            Facturación
          </a>
          {/* Botón de logout al final del slide menu */}
          <div className="flex-grow" />
          <a href="/login" className="flex items-center gap-3 px-3 py-2 mb-6 rounded-lg text-white/80 hover:bg-[#181A20] hover:text-[#FF5C5C] font-poppins text-base font-medium transition-colors">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M16 17l5-5-5-5" stroke="#FF5C5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12H9" stroke="#FF5C5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 19a7 7 0 1 1 0-14" stroke="#70F6F7" strokeWidth="2"/></svg>
            Cerrar sesión
          </a>
        </nav>
      </aside>
      {/* Overlay para cerrar el menú en móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Contenido principal ajustado */}
      <main className="flex-1 flex flex-col p-4 md:p-8 transition-all duration-300 bg-transparent h-screen overflow-y-auto">
        {/* Barra superior de status y acciones */}
        <section className="w-[95vw] md:w-[80vw] max-w-6xl mx-auto flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-white/5 rounded-xl p-4 mb-2 shadow-sm border border-white/10">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span className="font-semibold">aa****.com</span>
              <span className="px-2">|</span>
              <span>System: Debian GNU/Linux 12 x86_64</span>
              <span className="px-2">|</span>
              <span>Up Time: 90 Day(s)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-green-600/80 text-white px-2 py-1 rounded font-semibold">Pro</span>
              <span className="text-green-400">✔️ 15 días sin reembolso</span>
              <span className="text-green-400">✔️ 2 SSL gratis</span>
              <span className="text-green-400">✔️ Soporte prioritario</span>
            </div>
          </div>
          {/* Sys Status */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white/5 rounded-xl p-4 shadow-sm border border-white/10">
            {[
              { label: 'Load status', value: '8%', desc: 'Smooth operation' },
              { label: 'CPU usage', value: '5.1%', desc: '2 Core(s)' },
              { label: 'RAM usage', value: '47.7%', desc: '911 / 1911(MB)' },
              { label: '/', value: '64%', desc: '23.68G / 39.07G' },
              { label: '/etc/hosts', value: '64%', desc: '23.68G / 39.07G' },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" stroke="#2D3748" strokeWidth="8" fill="none" />
                    <circle cx="40" cy="40" r="34" stroke="#7BFF08" strokeWidth="8" fill="none" strokeDasharray="213.6" strokeDashoffset={213.6 - (parseFloat(item.value) / 100) * 213.6} style={{transition:'stroke-dashoffset 0.5s'}} />
                  </svg>
                  <span className="absolute text-lg font-bold text-green-400">{item.value}</span>
                </div>
                <span className="text-xs text-white/80 mt-2">{item.label}</span>
                <span className="text-xs text-white/40">{item.desc}</span>
              </div>
            ))}
          </div>
          {/* Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center border border-white/10">
              <span className="text-2xl font-bold text-green-400">2</span>
              <span className="text-xs text-white/80 mt-1">Site</span>
            </div>
            <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center border border-white/10">
              <span className="text-2xl font-bold text-green-400">0</span>
              <span className="text-xs text-white/80 mt-1">FTP</span>
            </div>
            <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center border border-white/10">
              <span className="text-2xl font-bold text-green-400">1</span>
              <span className="text-xs text-white/80 mt-1">DB</span>
            </div>
            <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center border border-white/10">
              <span className="text-2xl font-bold text-red-400">15</span>
              <span className="text-xs text-white/80 mt-1">Security</span>
              <button className="mt-2 px-2 py-1 text-xs rounded bg-green-100/10 text-green-400 border border-green-400/30 hover:bg-green-400/10 transition">Open security risk</button>
            </div>
          </div>
          {/* Software y tráfico (mock visual) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col gap-2">
              <span className="font-semibold text-white/80 mb-2">Software</span>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['Website Firewall', 'Website statistics-v2', 'Website Tamper-proof', 'Anti-intrusion'].map((sw, i) => (
                  <div key={i} className="bg-white/10 rounded-lg p-3 flex flex-col items-center border border-white/10">
                    <span className="text-xs text-white/80 mb-1">{sw}</span>
                    <div className="flex gap-1">
                      <button className="text-xs px-2 py-1 rounded bg-white/10 text-white/60 border border-white/10 hover:bg-white/20">Preview</button>
                      <button className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 border border-green-400/30 hover:bg-green-400/20">Buy now</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col gap-2">
              <span className="font-semibold text-white/80 mb-2">Traffic</span>
              <div className="flex flex-col gap-1 text-xs text-white/80">
                <div className="flex gap-4">
                  <span className="text-yellow-300">Upstream: 7.18 KB</span>
                  <span className="text-blue-300">Downstream: 8.76 KB</span>
                  <span>Total sent: 37.99 MB</span>
                  <span>Total received: 558.38 MB</span>
                </div>
                <div className="w-full h-24 bg-white/10 rounded mt-2 flex items-center justify-center text-white/30 text-xs">[Gráfica de tráfico aquí]</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
