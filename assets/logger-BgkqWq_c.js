import{c as r,j as t,t as o}from"./index-DULTfg1B.js";import{L as f}from"./vendor-react-KegtV43v.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=r("ArrowRight",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"m12 5 7 7-7 7",key:"xquz4c"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=r("BarChart2",[["line",{x1:"18",x2:"18",y1:"20",y2:"10",key:"1xfpm4"}],["line",{x1:"12",x2:"12",y1:"20",y2:"4",key:"be30l9"}],["line",{x1:"6",x2:"6",y1:"20",y2:"14",key:"1r4le6"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=r("Settings",[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",key:"1qme2f"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=r("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=r("Upload",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"17 8 12 3 7 8",key:"t8dd8p"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15",key:"widbto"}]]),b=[{title:"Portfolio Overview",description:"View your complete portfolio performance and holdings",path:"/journal?tab=portfolio",icon:s,category:"analysis"},{title:"Trade Plans",description:"Create and manage your trading strategies",path:"/journal?tab=trades",icon:l,category:"trading"},{title:"Trade History",description:"Review your completed trades and performance",path:"/journal?tab=history",icon:s,category:"analysis"},{title:"Options Trading",description:"Advanced options analysis and trading tools",path:"/options",icon:l,category:"trading"},{title:"Portfolio Upload",description:"Import and share your portfolio data",path:"/journal?tab=upload",icon:j,category:"management"},{title:"System Operations",description:"Monitor system performance and operations",path:"/journal?tab=operations",icon:w,category:"management"}];function k({theme:a,currentPath:h,maxItems:x=3}){const i=b.filter(e=>e.path!==h).slice(0,x);return i.length===0?null:t.jsxs("div",{className:`${o[a].card} rounded-lg p-6 shadow-md`,children:[t.jsx("h3",{className:`text-lg font-semibold ${o[a].text} mb-4`,children:"Related Features"}),t.jsx("div",{className:"space-y-3",children:i.map(e=>{const u=e.icon;return t.jsxs(f,{to:e.path,className:`flex items-start space-x-3 p-3 rounded-lg ${o[a].cardHover} group transition-all duration-200`,title:`Navigate to ${e.title}`,children:[t.jsx(u,{className:`w-5 h-5 mt-0.5 ${o[a].text} opacity-75 group-hover:opacity-100`}),t.jsxs("div",{className:"flex-1 min-w-0",children:[t.jsx("h4",{className:`text-sm font-medium ${o[a].text} group-hover:text-blue-600 transition-colors`,children:e.title}),t.jsx("p",{className:`text-xs ${o[a].text} opacity-75 mt-1`,children:e.description})]}),t.jsx(v,{className:`w-4 h-4 ${o[a].text} opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all`})]},e.path)})})]})}const c={error:0,warn:1,info:2,debug:3};var d,p,y,g;const m=((p=(d=import.meta)==null?void 0:d.env)==null?void 0:p.VITE_LOG_LEVEL)||((g=(y=import.meta)==null?void 0:y.env)!=null&&g.DEV?"debug":"warn"),n=a=>c[a]<=c[m],R={error:(...a)=>{n("error")&&console.error("[ERROR]",...a)},warn:(...a)=>{n("warn")&&console.warn("[WARN]",...a)},info:(...a)=>{n("info")&&console.info("[INFO]",...a)},debug:(...a)=>{n("debug")&&console.debug("[DEBUG]",...a)},level:m};export{s as B,k as R,w as S,l as T,j as U,R as l};
