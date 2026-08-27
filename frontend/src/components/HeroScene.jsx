import './HeroScene.css'

export default function HeroScene() {
  return (
    <div className="hero-canvas" aria-label="Animated logistics network showing three route strategies">
      <svg className="hero-logistics-svg" viewBox="0 0 760 620" role="img" aria-label="Animated delivery truck moving through a multi-route logistics network">
        <defs>
          <linearGradient id="heroRoad" x1="0" x2="1">
            <stop offset="0" stopColor="#10281d" />
            <stop offset=".5" stopColor="#1b3b2d" />
            <stop offset="1" stopColor="#10281d" />
          </linearGradient>
          <linearGradient id="heroTruck" x1="0" x2="1">
            <stop offset="0" stopColor="#8fffc1" />
            <stop offset="1" stopColor="#22c978" />
          </linearGradient>
          <linearGradient id="heroCab" x1="0" x2="1">
            <stop offset="0" stopColor="#f3fff8" />
            <stop offset="1" stopColor="#b6ebd0" />
          </linearGradient>
          <radialGradient id="heroGlow">
            <stop offset="0" stopColor="#35df8a" stopOpacity=".22" />
            <stop offset="1" stopColor="#35df8a" stopOpacity="0" />
          </radialGradient>
          <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="truckShadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#000" floodOpacity=".34" />
          </filter>
        </defs>

        <circle cx="380" cy="300" r="270" fill="url(#heroGlow)" />
        <circle cx="380" cy="300" r="244" fill="none" stroke="#61f0aa" strokeOpacity=".09" />
        <circle cx="380" cy="300" r="182" fill="none" stroke="#61f0aa" strokeOpacity=".06" />

        <g className="hero-grid" opacity=".55">
          {Array.from({ length: 9 }).map((_, index) => (
            <line key={`v-${index}`} x1={132 + index * 62} y1="104" x2={132 + index * 62} y2="510" />
          ))}
          {Array.from({ length: 7 }).map((_, index) => (
            <line key={`h-${index}`} x1="112" y1={132 + index * 58} x2="648" y2={132 + index * 58} />
          ))}
        </g>

        <g className="hero-city hero-city-left">
          <path d="M118 270 165 244 211 270 165 297Z" />
          <path d="M138 232 165 217 192 232 165 248Z" />
          <path d="M145 174 165 163 185 174 165 186Z" />
          <path d="M148 174 165 184 165 217 148 207Z" />
          <path d="M165 184 182 174 182 207 165 217Z" />
          <path d="M128 230 143 222 158 230 143 239Z" />
          <path d="M132 230 143 237 143 258 132 251Z" />
          <path d="M143 237 154 230 154 251 143 258Z" />
        </g>

        <g className="hero-city hero-city-right">
          <path d="M548 338 595 312 642 338 595 365Z" />
          <path d="M568 299 595 284 622 299 595 315Z" />
          <path d="M576 239 595 228 614 239 595 250Z" />
          <path d="M579 239 595 248 595 284 579 274Z" />
          <path d="M595 248 611 239 611 274 595 284Z" />
          <path d="M620 292 633 285 646 292 633 300Z" />
          <path d="M622 292 633 299 633 322 622 315Z" />
          <path d="M633 299 644 292 644 315 633 322Z" />
        </g>

        <path id="hero-main-route" d="M155 380 C235 335 260 255 352 282 S505 400 612 300" fill="none" />
        <path d="M155 380 C235 335 260 255 352 282 S505 400 612 300" fill="none" stroke="#07150f" strokeWidth="84" strokeLinecap="round" />
        <path d="M155 380 C235 335 260 255 352 282 S505 400 612 300" fill="none" stroke="url(#heroRoad)" strokeWidth="72" strokeLinecap="round" />
        <path d="M155 380 C235 335 260 255 352 282 S505 400 612 300" fill="none" stroke="#d8fff0" strokeOpacity=".46" strokeWidth="3" strokeDasharray="16 22" strokeLinecap="round" />

        <path id="hero-fast-route" d="M150 398 C236 290 340 225 448 270 S558 348 620 285" fill="none" stroke="#55a7ff" strokeOpacity=".78" strokeWidth="4" strokeLinecap="round" />
        <path id="hero-balanced-route" d="M150 380 C255 340 310 315 384 326 S520 354 620 300" fill="none" stroke="#ffbf5b" strokeOpacity=".82" strokeWidth="4" strokeLinecap="round" />
        <path id="hero-green-route" d="M150 365 C245 370 302 260 384 280 S502 398 620 316" fill="none" stroke="#35df8a" strokeOpacity=".92" strokeWidth="5" strokeLinecap="round" />

        <g className="hero-route-pulses">
          <circle r="5" fill="#55a7ff"><animateMotion dur="4.8s" repeatCount="indefinite"><mpath href="#hero-fast-route" /></animateMotion></circle>
          <circle r="5" fill="#ffbf5b"><animateMotion dur="5.5s" begin="-2s" repeatCount="indefinite"><mpath href="#hero-balanced-route" /></animateMotion></circle>
          <circle r="6" fill="#35df8a" filter="url(#softGlow)"><animateMotion dur="4.2s" begin="-1s" repeatCount="indefinite"><mpath href="#hero-green-route" /></animateMotion></circle>
        </g>

        <g className="hero-node hero-node-a" transform="translate(150 380)">
          <circle r="18" fill="#0a1a13" stroke="#caffdf" strokeWidth="2" />
          <circle r="6" fill="#caffdf" />
        </g>
        <g className="hero-node hero-node-b" transform="translate(620 300)">
          <circle r="18" fill="#0a1a13" stroke="#35df8a" strokeWidth="2" />
          <circle r="6" fill="#35df8a" />
        </g>

        <g className="hero-truck" filter="url(#truckShadow)">
          <g transform="translate(-48 -31)">
            <ellipse cx="47" cy="59" rx="48" ry="11" fill="#000" opacity=".24" />
            <rect x="36" y="8" width="66" height="42" rx="8" fill="url(#heroTruck)" />
            <path d="M8 24h30v26H6V32c0-4 1-6 2-8Z" fill="url(#heroCab)" />
            <path d="M11 27h20v11H11Z" fill="#377a68" opacity=".7" />
            <rect x="70" y="14" width="24" height="5" rx="2.5" fill="#d9ffea" opacity=".42" />
            <circle cx="22" cy="51" r="10" fill="#06100c" />
            <circle cx="22" cy="51" r="4" fill="#8fb4a0" />
            <circle cx="81" cy="51" r="10" fill="#06100c" />
            <circle cx="81" cy="51" r="4" fill="#8fb4a0" />
            <rect x="5" y="42" width="98" height="5" rx="2.5" fill="#07130f" opacity=".42" />
          </g>
          <animateMotion dur="8s" repeatCount="indefinite" rotate="auto"><mpath href="#hero-main-route" /></animateMotion>
        </g>

        <g className="hero-data-card" transform="translate(462 132)">
          <rect width="154" height="72" rx="16" fill="#081b13" fillOpacity=".91" stroke="#a6ffd0" strokeOpacity=".13" />
          <circle cx="20" cy="22" r="5" fill="#35df8a" />
          <text x="34" y="26">LIVE LOGISTICS</text>
          <text className="hero-data-strong" x="18" y="51">3 route strategies</text>
        </g>
      </svg>

      <div className="hero-scene-legend" aria-hidden="true">
        <span className="fast">Fast</span><span className="balanced">Balanced</span><span className="green">Green</span>
      </div>
    </div>
  )
}
