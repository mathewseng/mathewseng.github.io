// SPDX-License-Identifier: GPL-3.0-or-later
import { installInputBehavior } from '../ui/input-behavior.mjs';
import { settings } from '../core/storage.mjs';
import { applyBoardTheme } from '../core/appearance.mjs';
import { applySkin } from '../ui/skin.mjs';
import { startUpdates } from '../ui/updates.mjs';
import { openingGuide } from '../ui/opening-guide.mjs';

async function boot() {
  installInputBehavior();
  applySkin(settings().skin);
  await startUpdates({hub:true,onStatus:({state,message})=>{
    const status=document.getElementById('app-update-status');
    status.dataset.state=state;status.textContent=message;
  }});
  applyBoardTheme(settings().boardTheme);
  addEventListener('storage',event=>{
    if(event.key==='backgammon.v1.settings'||event.key===null){applySkin(settings().skin);applyBoardTheme(settings().boardTheme);}
  });
  openingGuide(document.getElementById('openings'));
  document.documentElement.dataset.appReady='true';
}
boot();
