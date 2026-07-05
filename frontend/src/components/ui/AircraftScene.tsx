import { motion } from 'framer-motion'

export default function AircraftScene() {
  return (
    <svg viewBox="0 0 760 500" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="skyFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1E5EFF" stopOpacity="0" />
          <stop offset="100%" stopColor="#082A63" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id="globeGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3B7BFF" />
          <stop offset="60%" stopColor="#0F3D91" />
          <stop offset="100%" stopColor="#051A45" />
        </radialGradient>
        <linearGradient id="fuselageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D7E3FB" />
        </linearGradient>
      </defs>

      {/* ambient clouds */}
      <g opacity="0.55">
        <ellipse cx="120" cy="430" rx="140" ry="26" fill="#FFFFFF" opacity="0.25" />
        <ellipse cx="600" cy="460" rx="180" ry="30" fill="#FFFFFF" opacity="0.18" />
        <ellipse cx="400" cy="500" rx="260" ry="34" fill="#FFFFFF" opacity="0.22" />
      </g>

      {/* radar sweep circles */}
      <g transform="translate(620,110)" opacity="0.5">
        <circle r="34" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" />
        <circle r="58" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1" />
        <circle r="82" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="1" />
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
          style={{ transformOrigin: '0px 0px' }}
        >
          <path d="M0,0 L0,-82 A82,82 0 0,1 30,-76 Z" fill="#FFFFFF" opacity="0.08" />
        </motion.g>
        <circle r="3" fill="#FFFFFF" />
        <path d="M-7,2 L0,-8 L7,2 L0,-2 Z" fill="#FFFFFF" />
      </g>
      <text x="585" y="208" fill="#9DB8F2" fontSize="11" letterSpacing="1.5" fontFamily="Inter, sans-serif">LIVE TRACKING</text>
      <text x="585" y="226" fill="#FFFFFF" fontSize="15" fontWeight="700" fontFamily="Inter, sans-serif">5Y-DWN</text>
      <text x="585" y="244" fill="#B9CCF4" fontSize="12" fontFamily="Inter, sans-serif">FL350   290KT</text>

      {/* flight route dotted path */}
      <path
        d="M70,375 C160,360 230,300 305,270 C340,255 360,235 365,210"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeDasharray="2 6"
        strokeLinecap="round"
        opacity="0.7"
      />
      <g transform="translate(70,375)">
        <circle r="5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
        <path d="M0,-12 L0,-3" stroke="#FFFFFF" strokeWidth="1.2" />
      </g>
      <text x="48" y="398" fill="#CFE0FF" fontSize="11.5" fontFamily="Inter, sans-serif">EGPD</text>

      <g transform="translate(365,205)">
        <path d="M0,0 C-7,-12 -7,-22 0,-22 C7,-22 7,-12 0,0 Z" fill="#FFFFFF" />
        <circle cx="0" cy="-22" r="4.2" fill="#0F3D91" />
      </g>
      <text x="345" y="190" fill="#FFFFFF" fontSize="11.5" fontFamily="Inter, sans-serif">FTTC</text>

      <path d="M300,275 l8,-6 l-2,9 z" fill="#FFFFFF" opacity="0.85" />

      {/* Dash 8 aircraft - side profile, nose pointed left-down, climbing attitude */}
      <motion.g
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
      >
        <g transform="translate(60,250) rotate(-6)">
          {/* fuselage */}
          <path
            d="M0,60 C40,66 380,70 470,58 C500,54 520,50 528,46 C520,42 480,40 440,40 C320,38 80,40 20,46 C5,48 -5,54 0,60 Z"
            fill="url(#fuselageGrad)"
            stroke="#B6C8EE"
            strokeWidth="1"
          />
          {/* nose */}
          <path d="M0,60 C-10,56 -14,50 -8,46 C-2,42 8,44 20,46 C12,50 6,56 0,60 Z" fill="#E7EDFB" stroke="#B6C8EE" strokeWidth="1" />
          {/* cockpit windows */}
          <path d="M6,48 L26,46 L24,52 L8,53 Z" fill="#0F3D91" opacity="0.85" />
          {/* cabin windows row */}
          {Array.from({ length: 16 }).map((_, i) => (
            <rect key={i} x={48 + i * 24} y="50" width="9" height="6" rx="2" fill="#0F3D91" opacity="0.55" />
          ))}
          {/* tail fin */}
          <path d="M438,42 C448,10 470,-4 488,-2 C480,16 470,34 458,44 Z" fill="url(#fuselageGrad)" stroke="#B6C8EE" strokeWidth="1" />
          <path d="M460,-1 C470,-1 478,4 482,9 L460,18 Z" fill="#1E5EFF" opacity="0.9" />
          {/* tailplane */}
          <path d="M455,42 C475,38 500,38 515,42 C500,46 475,46 455,42 Z" fill="#E7EDFB" stroke="#B6C8EE" strokeWidth="0.8" />
          {/* horizontal stabilizer small */}
          <path d="M495,40 C508,36 522,37 530,40 C522,43 508,43 495,40 Z" fill="#E7EDFB" stroke="#B6C8EE" strokeWidth="0.8" />

          {/* wing - high wing turboprop, swept back from fuselage top */}
          <path
            d="M150,42 C100,10 30,-30 -40,-46 C-30,-30 0,-2 60,30 C100,40 130,44 150,42 Z"
            fill="#EAF0FC"
            stroke="#B6C8EE"
            strokeWidth="1"
          />
          <path
            d="M210,42 C260,8 340,-32 410,-48 C398,-30 366,-2 300,32 C260,42 230,44 210,42 Z"
            fill="#EAF0FC"
            stroke="#B6C8EE"
            strokeWidth="1"
          />

          {/* engine nacelles + propellers, left wing */}
          <g transform="translate(20,-2)">
            <ellipse cx="0" cy="0" rx="34" ry="11" fill="#1A2540" />
            <circle cx="-32" cy="0" r="3.2" fill="#0B0F1A" />
            <g className="prop-spin">
              <line x1="-32" y1="0" x2="-32" y2="-34" stroke="#11151F" strokeWidth="3.4" strokeLinecap="round" />
              <line x1="-32" y1="0" x2="-3" y2="14" stroke="#11151F" strokeWidth="3.4" strokeLinecap="round" />
              <line x1="-32" y1="0" x2="-61" y2="14" stroke="#11151F" strokeWidth="3.4" strokeLinecap="round" />
            </g>
          </g>
          <g transform="translate(280,-4)">
            <ellipse cx="0" cy="0" rx="34" ry="11" fill="#1A2540" />
            <circle cx="-32" cy="0" r="3.2" fill="#0B0F1A" />
            <g className="prop-spin">
              <line x1="-32" y1="0" x2="-32" y2="-34" stroke="#11151F" strokeWidth="3.4" strokeLinecap="round" />
              <line x1="-32" y1="0" x2="-3" y2="14" stroke="#11151F" strokeWidth="3.4" strokeLinecap="round" />
              <line x1="-32" y1="0" x2="-61" y2="14" stroke="#11151F" strokeWidth="3.4" strokeLinecap="round" />
            </g>
          </g>

          {/* livery stripe */}
          <path d="M30,52 L470,46 L470,49 L30,55 Z" fill="#1E5EFF" />
          {/* orca tail logo */}
          <path d="M468,18 C472,12 480,10 484,14 C480,16 476,20 474,24 C472,20 470,18 468,18 Z" fill="#FFFFFF" />
        </g>
      </motion.g>

      {/* globe */}
      <g transform="translate(610,440)">
        <circle r="100" fill="url(#globeGrad)" />
        <circle r="100" fill="none" stroke="#5C8CFF" strokeOpacity="0.4" strokeWidth="1" />
        <g opacity="0.35" stroke="#FFFFFF" strokeWidth="0.6" fill="none">
          <ellipse rx="100" ry="34" />
          <ellipse rx="100" ry="34" transform="rotate(60)" />
          <ellipse rx="100" ry="34" transform="rotate(120)" />
          <circle r="60" />
          <circle r="30" />
        </g>
        <path d="M-70,-30 C-30,-50 20,-45 55,-15 C70,0 60,25 30,35" fill="none" stroke="#8FB4FF" strokeWidth="1.4" strokeDasharray="1 4" opacity="0.8" />
        <circle cx="-70" cy="-30" r="2.4" fill="#FFFFFF" />
        <circle cx="30" cy="35" r="2.4" fill="#FFFFFF" />
        <circle cx="-10" cy="-38" r="2" fill="#FFFFFF" opacity="0.8" />
      </g>

      {/* small mountain silhouette bottom right of globe area, like reference */}
      <path d="M520,500 L560,455 L585,480 L620,440 L660,500 Z" fill="#0A2050" opacity="0.6" />
    </svg>
  )
}
