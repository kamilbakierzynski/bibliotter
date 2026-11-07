import { describe, expect, it } from 'vitest'
import type { Anchor } from '../src/shared/annotations'
import {
  boxWithin,
  type CameraMove,
  cameraAt,
  fitShot,
  frameTransform,
  MAX_CAMERA_SCALE,
  parseCameraShot,
  parseCameraView
} from '../src/shared/camera'

const anchor: Anchor = { selector: '#diagram', offsetX: 0.5, offsetY: 0.5, quote: '', heading: 'Plan' }
const parseAnchor = (value: unknown): Anchor | null =>
  typeof value === 'object' && value !== null && (value as Anchor).selector === '#diagram' ? anchor : null

const viewport = { width: 1000, height: 800, foot: 84 }

describe('fitShot', () => {
  it('wypełnia widok nad dokiem z oddechem przy krawędziach', () => {
    const shot = fitShot({ x: 100, y: 2000, width: 400, height: 200 }, viewport)
    // Szerokość pozwala na 2,5×, a wysokość nad dokiem na 3,58×, więc decyduje szerokość.
    expect(shot.scale).toBeCloseTo(2.5 * 0.9)
    expect(shot.centerX).toBe(300)
    expect(shot.centerY).toBeCloseTo(2100 + 84 / (2 * 2.25))
  })

  it('nie oddala poniżej całej strony i nie powiększa ponad limit', () => {
    expect(fitShot({ x: 0, y: 0, width: 3000, height: 3000 }, viewport).scale).toBe(1)
    expect(fitShot({ x: 0, y: 0, width: 4, height: 4 }, viewport).scale).toBe(MAX_CAMERA_SCALE)
  })

  it('zawęża element do kawałka z kadru', () => {
    const box = boxWithin({ x: 100, y: 200, width: 400, height: 300 }, { x: 0.5, y: 0.25, width: 0.5, height: 0.5 })
    expect(box).toEqual({ x: 300, y: 275, width: 200, height: 150 })
  })
})

describe('cameraAt', () => {
  const zoomIn: CameraMove = { from: { left: 0, top: 1200, scale: 1 }, to: { left: 300, top: 1500, scale: 2.5 } }
  const screenOf = (x: number, y: number, at: { left: number; top: number; scale: number }): [number, number] => [
    (x - at.left) * at.scale,
    (y - at.top) * at.scale
  ]

  it('zaczyna w widoku startowym i kończy w docelowym', () => {
    expect(cameraAt(zoomIn, 0)).toEqual(zoomIn.from)
    const end = cameraAt(zoomIn, 1)
    expect(end.left).toBeCloseTo(zoomIn.to.left)
    expect(end.top).toBeCloseTo(zoomIn.to.top)
    expect(end.scale).toBeCloseTo(zoomIn.to.scale)
  })

  it('powiększa geometrycznie', () => {
    expect(cameraAt(zoomIn, 0.5).scale).toBeCloseTo(Math.sqrt(2.5))
  })

  it('trzyma jeden punkt strony w tym samym miejscu ekranu przez cały ruch', () => {
    const { from, to } = zoomIn
    const fixedX = (to.left * to.scale - from.left * from.scale) / (to.scale - from.scale)
    const fixedY = (to.top * to.scale - from.top * from.scale) / (to.scale - from.scale)
    const [startX, startY] = screenOf(fixedX, fixedY, from)
    for (const progress of [0.1, 0.35, 0.6, 0.9]) {
      const [x, y] = screenOf(fixedX, fixedY, cameraAt(zoomIn, progress))
      expect(x).toBeCloseTo(startX)
      expect(y).toBeCloseTo(startY)
    }
  })

  it('przy tej samej skali tylko przesuwa widok', () => {
    const pan: CameraMove = { from: { left: 0, top: 0, scale: 2 }, to: { left: 100, top: 400, scale: 2 } }
    expect(cameraAt(pan, 0.25)).toEqual({ left: 25, top: 100, scale: 2 })
  })
})

describe('frameTransform', () => {
  it('nie rusza zrzutu, który pokazuje bieżący widok', () => {
    const view = { left: 40, top: 900, scale: 2 }
    expect(frameTransform(view, view)).toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('stawia każdy punkt zrzutu tam, gdzie widzi go kamera', () => {
    const image = { left: 0, top: 1200, scale: 1 }
    const at = { left: 150, top: 1350, scale: 1.6 }
    const { x, y, scale } = frameTransform(image, at)
    // Punkt strony (400, 1500) leży w zrzucie w (400, 300), bo zrzut ma skalę 1.
    expect(x + 400 * scale).toBeCloseTo((400 - at.left) * at.scale)
    expect(y + 300 * scale).toBeCloseTo((1500 - at.top) * at.scale)
  })
})

describe('parseCameraShot', () => {
  it('przyjmuje prostokąt i kotwicę z kawałkiem elementu', () => {
    expect(parseCameraShot({ rect: { x: 1, y: 2, width: 3, height: 4 } }, parseAnchor)).toEqual({
      rect: { x: 1, y: 2, width: 3, height: 4 }
    })
    expect(parseCameraShot({ anchor: { selector: '#diagram' } }, parseAnchor)).toEqual({ anchor })
    expect(
      parseCameraShot({ anchor: { selector: '#diagram' }, box: { x: 0, y: 0, width: 0.5, height: 0.5 } }, parseAnchor)
    ).toEqual({ anchor, box: { x: 0, y: 0, width: 0.5, height: 0.5 } })
  })

  it('odrzuca kadry, których dokument nie umie pokazać', () => {
    expect(parseCameraShot(null, parseAnchor)).toBeNull()
    expect(parseCameraShot({ rect: { x: 0, y: 0, width: -1, height: 4 } }, parseAnchor)).toBeNull()
    expect(parseCameraShot({ rect: { x: Number.NaN, y: 0, width: 1, height: 4 } }, parseAnchor)).toBeNull()
    expect(parseCameraShot({ anchor: { selector: '#inny' } }, parseAnchor)).toBeNull()
    expect(parseCameraShot({ anchor: { selector: '#diagram' }, box: { x: 0 } }, parseAnchor)).toBeNull()
  })

  it('sprawdza widok odesłany przez dokument', () => {
    expect(parseCameraView({ left: 1, top: 2, scale: 1.5 })).toEqual({ left: 1, top: 2, scale: 1.5 })
    expect(parseCameraView({ left: 1, top: 2, scale: 0 })).toBeNull()
    expect(parseCameraView('widok')).toBeNull()
  })
})
