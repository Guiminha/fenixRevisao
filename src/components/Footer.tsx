import React from "react";

export default function Footer() {
  return (
    <footer 
      id="platform-footer"
      className="mt-auto h-auto min-h-[64px] md:h-12 bg-[#0b0f14] border-t border-white/5 flex flex-col md:flex-row items-center justify-between px-4 md:px-8 py-3 md:py-0 text-[10px] text-[#8a96a3] tracking-widest uppercase select-none z-10 gap-2 md:gap-0 text-center md:text-left"
    >
      {/* Left section: Copyright */}
      <div>
        &copy; {new Date().getFullYear()} <span className="font-bold text-[#e8edf2]">GRUPO FÊNIX</span>. TODOS OS DIREITOS RESERVADOS.
      </div>
    </footer>
  );
}
