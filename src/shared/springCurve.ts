/**
 * Prawdziwa krzywa sprężyny dla przejść CSS i Web Animations. Bez DOM, więc służy powłoce
 * i warstwie w dokumencie.
 */
export function springCurve(k: number, z: number, seconds = 1): string {
  let x = 0
  let v = 0
  const damping = 2 * z * Math.sqrt(k)
  const dt = 1 / 240
  const steps = Math.round(seconds / dt)
  const every = Math.round(steps / 56)
  const points: number[] = []
  for (let i = 0; i <= steps; i++) {
    if (i % every === 0) points.push(Number(x.toFixed(4)))
    v += (k * (1 - x) - damping * v) * dt
    x += v * dt
  }
  points[points.length - 1] = 1
  return `linear(${points.join(',')})`
}
