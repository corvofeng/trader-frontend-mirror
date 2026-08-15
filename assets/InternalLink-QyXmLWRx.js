import{Q as f,$ as r,E as k}from"./index-CzdFhv9i.js";import{L as u}from"./vendor-react-Lc6FY1av.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=f("Globe",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]]);function b({to:t,children:s,className:o="",title:n,openInNewTab:e=!1,rel:l,"aria-label":c,...p}){const a=t.startsWith("http")||t.startsWith("//"),m=t.startsWith("mailto:")||t.startsWith("tel:"),h=a||m||e,x=e||a?"_blank":void 0,i={className:`${o} transition-colors duration-200`,title:n||(typeof s=="string"?s:void 0),"aria-label":c,rel:l||(a?"noopener noreferrer":void 0),...p};return h?r.jsxs("a",{href:t,target:x,...i,children:[s,a&&r.jsx(k,{className:"w-3 h-3 inline ml-1"})]}):r.jsx(u,{to:t,...i,children:s})}export{L as G,b as I};
