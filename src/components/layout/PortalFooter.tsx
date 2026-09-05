export default function PortalFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-8 bg-[#2b2b2b] text-[13px] text-white/80">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-7">
        <div>© {year} netrichtechnologies</div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <a href="#" className="text-[#6cb6ff] transition hover:text-white hover:underline">
            Website Terms
          </a>
          <a href="#" className="text-[#6cb6ff] transition hover:text-white hover:underline">
            Privacy Statement
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-[#6cb6ff] transition hover:text-white hover:underline"
          >
            Microsoft 365 Terms
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] leading-none">
              i
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
