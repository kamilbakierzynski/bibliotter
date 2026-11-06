import { useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { boot } from './shell/boot'
import { layerHost } from './shell/layer'
import { closeCmd } from './shell/palette'
import { ui, useShell } from './shell/state'
import { Dock, StatusPop } from './ui/Dock'
import { IconSprite } from './ui/icons'
import { Flyout, Nav } from './ui/Nav'
import { Insp } from './ui/Notes'
import { Stage } from './ui/Stage'

function Scrim(): React.JSX.Element {
  useShell()
  return <div className={ui.cmd ? 'scrim open' : 'scrim'} id="scrim" onClick={closeCmd} />
}

export function App(): React.JSX.Element {
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
      <Stage />
      <Nav />
      <Insp />
      <Scrim />
      {createPortal(
        <>
          <IconSprite />
          <Dock />
          <div className="tip" id="tip" />
        </>,
        layerHost()
      )}
      <div className="caps" id="caps" aria-hidden="true" />
      <StatusPop />
      <Flyout />
    </div>
  )
}
