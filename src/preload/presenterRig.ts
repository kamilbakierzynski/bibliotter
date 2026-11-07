/*
 * Geometria kijka. Trzyma go ktoś stojący przed arkuszem, więc dolny koniec leży daleko pod
 * krawędzią i prawie się nie rusza, a kąt zależy głównie od tego, gdzie w poziomie stoi ręka.
 */

/** Tu w poziomie, jako ułamek szerokości arkusza, kijek stoi pionowo. */
const UPRIGHT_AT = 0.72
/** Tangens pochylenia przy krawędzi leżącej o całą szerokość arkusza od pionu. */
const LEAN = 0.62
const MIN_FOOT_DROP = 520
const FOOT_DROP = 0.8
/** O tyle czubek palca chowa się pod dolną krawędzią, razem z cieniem. */
const HIDDEN_BELOW = 72

export function footY(height: number): number {
  return height + Math.max(MIN_FOOT_DROP, height * FOOT_DROP)
}

/** Gdzie stoi dolny koniec kijka, gdy ręka spoczywa w tym miejscu. */
export function restingFoot(x: number, y: number, width: number, height: number): number {
  const lean = (UPRIGHT_AT - x / Math.max(width, 1)) * LEAN
  return x + lean * (footY(height) - y)
}

/** Obrót ręki wokół czubka palca, w radianach. Ujemny kładzie palec w lewo. */
export function stickAngle(x: number, y: number, foot: number, height: number): number {
  return -Math.atan2(foot - x, footY(height) - y)
}

/** Droga wzdłuż kijka, po której ręka znika pod dolną krawędzią arkusza. */
export function retreat(y: number, height: number, angle: number): number {
  return (Math.max(height - y, 0) + HIDDEN_BELOW) / Math.cos(angle)
}
