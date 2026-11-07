import { useMemo } from 'react'

let marks = 0

const MIRROR = 'matrix(-1 0 0 1 100 0)'
const WHISKER = 'M15 50.6C10 50.3 6.5 50.5 3.9 51a.8.8 0 0 0 .1 1.6C7 52.4 11 53 15 54.2z'
const HEAD = 'M50 17c23 0 40 13 40 33 0 8-4 14-10 18H20c-6-4-10-10-10-18 0-20 17-33 40-33z'
const CAP = 'M10 50c0-20 17-33 40-33s40 13 40 33c-10 2-18 0-26-3-6-2.2-10-3.5-14-3.5s-8 1.3-14 3.5c-8 3-16 5-26 3z'
const SHEET = 'M20 63h55l11 11v32H14V69a6 6 0 0 1 6-6z'

function Ear(): React.JSX.Element {
  return (
    <>
      <circle cx="17" cy="28.5" r="5.8" fill="#7b7b84" />
      <circle cx="16.5" cy="28" r="2.5" fill="#37373d" />
    </>
  )
}

function Eye(): React.JSX.Element {
  return (
    <>
      <circle cx="34.5" cy="35" r="4.4" fill="#0c0c0e" />
      <circle cx="36" cy="33.5" r="1.4" fill="#fff" />
    </>
  )
}

const HAPPY = <path d="M30.1 37q4.4-5.4 8.8 0" fill="none" stroke="#0c0c0e" strokeWidth="2.8" strokeLinecap="round" />
const PAW = <rect x="26" y="57.5" width="16" height="13" rx="6.5" fill="#7b7b84" />

/**
 * Znak z paska w wersji na 36 punktów, rozłożony na części, które mogą się ruszać: uszy, wąsy,
 * oczy, nos i łapy. Kamyk pokazuje się tylko w Światowy Dzień Wydry.
 */
export function LogoMark(): React.JSX.Element {
  const id = useMemo(() => `mark${++marks}`, [])
  const url = (name: string): string => `url(#${id}-${name})`
  return (
    <svg className="mark" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-tile`}>
          <rect width="100" height="100" rx="23" />
        </clipPath>
        <clipPath id={`${id}-head`}>
          <path d={HEAD} />
        </clipPath>
        <radialGradient id={`${id}-room`} cx=".5" cy=".62" r=".75">
          <stop offset="0" stopColor="#232327" />
          <stop offset="1" stopColor="#0c0c0e" />
        </radialGradient>
        <linearGradient id={`${id}-fur`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f6f78" />
          <stop offset="1" stopColor="#858590" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={url('room')} />
      <g clipPath={url('tile')}>
        <g className="m-whisk" fill="#eeeef1" stroke="#eeeef1" strokeWidth="1.4" strokeLinejoin="round">
          <path d={WHISKER} />
          <path d={WHISKER} transform={MIRROR} />
        </g>
        <g className="m-ear-l">
          <Ear />
        </g>
        <g className="m-ear-r">
          <g transform={MIRROR}>
            <Ear />
          </g>
        </g>
        <path d="M10 50c0 8 4 14 10 18h60c6-4 10-10 10-18L50 38z" fill="#eeeef1" />
        <path d={CAP} fill={url('fur')} />
        <g className="m-gaze">
          <g className="m-eyes">
            <Eye />
            <g transform={MIRROR}>
              <Eye />
            </g>
          </g>
          <g className="m-happy">
            {HAPPY}
            <g transform={MIRROR}>{HAPPY}</g>
          </g>
        </g>
        <g className="m-snout">
          <path
            d="M43.5 41.5h13c1.8 0 2.7 2.2 1.4 3.4l-5 4.3c-1.6 1.4-4.2 1.4-5.8 0l-5-4.3c-1.3-1.2-.4-3.4 1.4-3.4z"
            fill="#0c0c0e"
          />
          <path
            d="M50 49v4.5m0 0c-2 3-7 3.5-10 1.5m10-1.5c2 3 7 3.5 10 1.5"
            fill="none"
            stroke="#0c0c0e"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <path d={SHEET} fill="none" stroke="#0c0c0e" strokeWidth="4.4" clipPath={url('head')} />
        <path d={SHEET} fill="#fbfbfc" />
        <path d="M75 63v5.5a5.5 5.5 0 0 0 5.5 5.5H86z" fill="#b9b9c1" />
        <path d="M27 83h46M27 93h27" fill="none" stroke="#c8c8ce" strokeWidth="4.2" strokeLinecap="round" />
        <g className="m-paw-l">{PAW}</g>
        <g className="m-paw-r">
          <g transform={MIRROR}>{PAW}</g>
        </g>
        <g className="m-stone">
          <ellipse cx="50" cy="62.4" rx="8.4" ry="6.6" fill="#5d5d66" stroke="#0c0c0e" strokeWidth="1.6" />
          <ellipse cx="47.2" cy="60" rx="3" ry="1.7" fill="#9a9aa3" />
        </g>
      </g>
    </svg>
  )
}
