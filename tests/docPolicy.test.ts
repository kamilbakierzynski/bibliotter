import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isExternalUrl, isRequestAllowed, resolveAssetPath } from '../src/main/docPolicy'

const context = { documentHost: 'dabc', allowedHosts: ['fonts.googleapis.com'] }
const allowed = (url: string): boolean => isRequestAllowed({ ...context, url })

describe('isRequestAllowed', () => {
  it('przepuszcza własny dokument, data, blob i hosty z listy', () => {
    expect(allowed('htmldoc://dabc/')).toBe(true)
    expect(allowed('data:image/png;base64,AAAA')).toBe(true)
    expect(allowed('blob:htmldoc://dabc/123')).toBe(true)
    expect(allowed('https://fonts.googleapis.com/css2?family=Barlow')).toBe(true)
  })

  it('blokuje inne dokumenty, obce hosty i niezaszyfrowany ruch', () => {
    expect(allowed('htmldoc://dinny/')).toBe(false)
    expect(allowed('https://example.com/?dane=1')).toBe(false)
    expect(allowed('http://fonts.googleapis.com/x')).toBe(false)
    expect(allowed('wss://fonts.googleapis.com/x')).toBe(false)
    expect(allowed('http://127.0.0.1:3000/api')).toBe(false)
    expect(allowed('file:///C:/Windows/win.ini')).toBe(false)
    expect(allowed('nie adres')).toBe(false)
  })

  it('nie myli hosta z listy z jego fałszywą wersją', () => {
    expect(allowed('https://fonts.googleapis.com.evil.test/x')).toBe(false)
    expect(allowed('https://evil.test/fonts.googleapis.com')).toBe(false)
  })
})

describe('isExternalUrl', () => {
  it('uznaje tylko http i https', () => {
    expect(isExternalUrl('https://example.com')).toBe(true)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalUrl('file:///C:/x')).toBe(false)
  })
})

describe('resolveAssetPath', () => {
  let root: string
  let doc: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'asset-'))
    await mkdir(join(root, 'docs', 'img'), { recursive: true })
    await mkdir(join(root, 'docs', '.prywatne'), { recursive: true })
    doc = join(root, 'docs', 'plan.html')
    await writeFile(doc, '')
    await writeFile(join(root, 'docs', 'img', 'a b.png'), '')
    await writeFile(join(root, 'docs', '.prywatne', 'a.png'), '')
    await writeFile(join(root, 'docs', '.env'), '')
    await writeFile(join(root, 'docs', 'inny.html'), '')
    await writeFile(join(root, 'sekret.png'), '')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('zwraca zasób obok dokumentu, także z kodowaną nazwą', async () => {
    expect(await resolveAssetPath(doc, '/img/a%20b.png')).toMatch(/a b\.png$/)
  })

  it('odrzuca wyjście poza katalog dokumentu', async () => {
    expect(await resolveAssetPath(doc, '/../sekret.png')).toBeNull()
    expect(await resolveAssetPath(doc, '/%2e%2e%2fsekret.png')).toBeNull()
    expect(await resolveAssetPath(doc, '/..%5csekret.png')).toBeNull()
  })

  it('odrzuca pliki ukryte, inne dokumenty i nieznane typy', async () => {
    expect(await resolveAssetPath(doc, '/.env')).toBeNull()
    expect(await resolveAssetPath(doc, '/.prywatne/a.png')).toBeNull()
    expect(await resolveAssetPath(doc, '/inny.html')).toBeNull()
    expect(await resolveAssetPath(doc, '/%E0%A4%A')).toBeNull()
  })

  it('odrzuca dowiązanie prowadzące poza katalog', async (test) => {
    try {
      await symlink(join(root, 'sekret.png'), join(root, 'docs', 'link.png'))
    } catch {
      test.skip() // Windows wymaga uprawnień do tworzenia dowiązań.
    }
    expect(await resolveAssetPath(doc, '/link.png')).toBeNull()
  })
})
