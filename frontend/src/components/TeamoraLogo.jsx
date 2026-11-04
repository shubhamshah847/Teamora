export function TeamoraMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M17.2 4.5a13.6 13.6 0 0 1 13.6 0l7.1 4.1A13.6 13.6 0 0 1 44.7 20v8a13.6 13.6 0 0 1-6.8 11.4l-7.1 4.1a13.6 13.6 0 0 1-13.6 0l-7.1-4.1A13.6 13.6 0 0 1 3.3 28v-8a13.6 13.6 0 0 1 6.8-11.4l7.1-4.1Z" fill="#4F46E5" />
      <path d="m16 29 8-14 8 14H16Z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="14" r="4.2" fill="#14B8A6" stroke="white" strokeWidth="1.6" />
      <circle cx="15" cy="30" r="3.4" fill="white" />
      <circle cx="33" cy="30" r="3.4" fill="white" />
    </svg>
  )
}

export default function TeamoraLogo() {
  return (
    <div className="brand-wrap" role="img" aria-label="Teamora">
      <div className="brand-mark"><TeamoraMark /></div>
      <p className="brand-name">team<span className="brand-accent">o</span>ra</p>
    </div>
  )
}