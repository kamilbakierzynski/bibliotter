import { useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { language } from '../../shared/i18n'
import { boot } from './shell/boot'
import { layerHost } from './shell/layer'
import { closeCmd } from './shell/palette'
import { ui, useShell, useShellValue } from './shell/state'
import { Dock, PresentNote, StatusPop } from './ui/Dock'
import { IconSprite } from './ui/icons'
import { LabelPop } from './ui/Labels'
import { HoverCard } from './ui/HoverCard'
import { Flyout, Nav } from './ui/Nav'
import { Insp } from './ui/Notes'
import { RowMenu } from './ui/RowMenu'
import { Stage } from './ui/Stage'

function Scrim(): React.JSX.Element {
  useShell()
  return <div className={ui.cmd ? 'scrim open' : 'scrim'} id="scrim" onClick={closeCmd} />
}

export function App(): React.JSX.Element {
  // Część interfejsu nie słucha `notify()`, a nowy język musi dojść do wszystkich napisów.
  useShellValue(language)
  useLayoutEffect(boot, [])
  return (
    <div className="app" id="app" data-tool="move">
      <IconSprite />
      <div className="wall" aria-hidden="true">
        <div className="lights" id="lights">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="titlebar" aria-hidden="true" />
      <Stage />
      <Nav />
      <Insp />
      <Scrim />
      {createPortal(
        <>
          <IconSprite />
          <Dock />
          <PresentNote />
          <div className="tip" id="tip" />
        </>,
        layerHost()
      )}
      <div className="caps" id="caps" aria-hidden="true" />
      <StatusPop />
      <LabelPop />
      <Flyout />
      <HoverCard />
      <RowMenu />
    </div>
  )
}
