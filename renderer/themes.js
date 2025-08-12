const PRIMARY_BLUE_CLS = 'htb-desktop-primary-blue';
const PRIMARY_RED_CLS  = 'htb-desktop-primary-red';
const PRIMARY_STYLE_ID = 'htb-desktop-primary-style';
const NAVBG_STYLE_ID   = 'htb-desktop-bg-override';

function ensurePrimaryStyle() {
  if (document.getElementById(PRIMARY_STYLE_ID)) return;
  const sty = document.createElement('style');
  sty.id = PRIMARY_STYLE_ID;
  sty.textContent = `
    html.${PRIMARY_BLUE_CLS}{
      --htb-accent:#66ccff;
      --htb-accent-weak:rgba(102,204,255,.2);
      --htb-contrast:rgb(4,51,74);
      --htb-accent-bg:rgb(159,201,222);
      --htb-accent-border:rgb(180,214,232);
      --htb-scrollbar-track:#121418;
      --htb-nav-bg:#0f1220;
      --htb-on-accent:#0d1117;
    }
    html.${PRIMARY_RED_CLS}{
      --htb-accent:#ff6b6b;
      --htb-accent-weak:rgba(255,107,107,.2);
      --htb-contrast:rgb(74,4,4);
      --htb-accent-bg:rgb(255,186,186);
      --htb-accent-border:rgb(255,204,204);
      --htb-scrollbar-track:#121418;
      --htb-nav-bg:#201012;
      --htb-on-accent:#0d1117;
    }

    html[class*="htb-desktop-primary-"] .v-application .primary{
      background-color:var(--htb-accent)!important;
      border-color:var(--htb-accent)!important;
    }
    html[class*="htb-desktop-primary-"] .v-application .primary--text,
    html[class*="htb-desktop-primary-"] .v-application .text--primary{
      color:var(--htb-accent)!important; caret-color:var(--htb-accent)!important;
    }
    html[class*="htb-desktop-primary-"] .color-green{ color:var(--htb-accent)!important; }
    html[class*="htb-desktop-primary-"] .htb-green{
      color:var(--htb-contrast)!important;
      background-color:var(--htb-accent-bg)!important;
      border-color:var(--htb-accent-border)!important;
    }

    html[class*="htb-desktop-primary-"] *::-webkit-scrollbar{ width:8px;height:8px }
    html[class*="htb-desktop-primary-"] *::-webkit-scrollbar-track{ background:var(--htb-scrollbar-track) }
    html[class*="htb-desktop-primary-"] *::-webkit-scrollbar-thumb{ background:var(--htb-accent); border-radius:4px }

    html[class*="htb-desktop-primary-"] .v-progress-linear__determinate,
    html[class*="htb-desktop-primary-"] .v-progress-linear__background{
      background-color:var(--htb-accent)!important; border-color:var(--htb-accent)!important;
    }
    html[class*="htb-desktop-primary-"] .v-progress-linear__bar,
    html[class*="htb-desktop-primary-"] .v-slider__track-fill,
    html[class*="htb-desktop-primary-"] .v-progress-circular__overlay{
      background-color:var(--htb-accent)!important; color:var(--htb-accent)!important; border-color:var(--htb-accent)!important;
    }
    html[class*="htb-desktop-primary-"] .v-progress-linear__buffer{ background-color:var(--htb-accent-weak)!important; }

    html[class*="htb-desktop-primary-"] .v-sparkline .v-sparkline__line{ stroke:var(--htb-accent)!important; }

    html[class*="htb-desktop-primary-"] svg path[stroke="#9fef00" i],
    html[class*="htb-desktop-primary-"] svg polyline[stroke="#9fef00" i]{ stroke:var(--htb-accent)!important; }

    html[class*="htb-desktop-primary-"] svg circle[fill="#9fef00" i],
    html[class*="htb-desktop-primary-"] svg circle[stroke="#9fef00" i]{ fill:var(--htb-accent)!important; stroke:var(--htb-accent)!important; }

    html[class*="htb-desktop-primary-"] [style*="rgb(159, 239, 0)"],
    html[class*="htb-desktop-primary-"] [style*="#9fef00" i]{ color:var(--htb-accent)!important; border-color:var(--htb-accent)!important; }

    html[class*="htb-desktop-primary-"] .arrow-up,
    html[class*="htb-desktop-primary-"] .arrow-up *{ color:var(--htb-accent)!important; background-color:transparent!important; }

    html[class*="htb-desktop-primary-"] .bg-color-green,
    html[class*="htb-desktop-primary-"] .v-icon.bg-color-green,
    html[class*="htb-desktop-primary-"] [class*="bg-color-green" i]{
      background-color:var(--htb-accent)!important; border-color:var(--htb-accent)!important; color:var(--htb-on-accent)!important;
    }
    html[class*="htb-desktop-primary-"] .bg-color-green *,
    html[class*="htb-desktop-primary-"] [class*="bg-color-green" i] *{
      color:var(--htb-on-accent)!important;
    }
    html[class*="htb-desktop-primary-"] .bg-color-green [style*="#9fef00" i],
    html[class*="htb-desktop-primary-"] .bg-color-green [style*="rgb(159, 239, 0)"],
    html[class*="htb-desktop-primary-"] [class*="bg-color-green" i] [style*="#9fef00" i],
    html[class*="htb-desktop-primary-"] [class*="bg-color-green" i] [style*="rgb(159, 239, 0)"]{
      color:var(--htb-on-accent)!important;
    }
  `;
  document.head.appendChild(sty);
}

function setNavBgColor(colorOrNull) {
  let s = document.getElementById(NAVBG_STYLE_ID);
  if (!colorOrNull) { if (s) s.remove(); return; }
  if (!s) { s = document.createElement('style'); s.id = NAVBG_STYLE_ID; document.head.appendChild(s); }
  s.textContent = `
    [class*="bg-color-blue-nav"],
    .bg-color-blue-nav,
    .bg-color-blue-nav-active,
    .slide.bg-color-blue-nav-active,
    .activeMachineBox{
      background:${colorOrNull}!important;
      background-color:${colorOrNull}!important;
    }
  `;
}

module.exports = { ensurePrimaryStyle, setNavBgColor, PRIMARY_BLUE_CLS, PRIMARY_RED_CLS };
