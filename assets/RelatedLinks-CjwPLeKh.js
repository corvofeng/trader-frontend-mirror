import{U as r,B as i,G as n,x as y,a0 as a,ab as o}from"./index-C1Gmsqnf.js";import{L as h}from"./vendor-react-Lc6FY1av.js";import{A as m}from"./arrow-right-DQwG1Cjm.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=r("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=r("EyeOff",[["path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24",key:"1jxqfv"}],["path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",key:"9wicm4"}],["path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",key:"1jreej"}],["line",{x1:"2",x2:"22",y1:"2",y2:"22",key:"a6p6uj"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=r("Eye",[["path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",key:"rwhkz3"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=r("Upload",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"17 8 12 3 7 8",key:"t8dd8p"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15",key:"widbto"}]]),g=[{title:"Portfolio Overview",description:"View your complete portfolio performance and holdings",path:"/journal?tab=portfolio",icon:i,category:"analysis"},{title:"Trade Plans",description:"Create and manage your trading strategies",path:"/journal?tab=trades",icon:n,category:"trading"},{title:"Trade History",description:"Review your completed trades and performance",path:"/admin?tab=history",icon:i,category:"analysis"},{title:"Options Trading",description:"Advanced options analysis and trading tools",path:"/options",icon:n,category:"trading"},{title:"Portfolio Upload",description:"Import and share your portfolio data",path:"/journal?tab=upload",icon:x,category:"management"},{title:"System Operations",description:"Monitor system performance and operations",path:"/journal?tab=operations",icon:y,category:"management"}];function b({theme:e,currentPath:c,maxItems:d=3,hideTradePlans:l=!1}){const s=g.filter(t=>!l||t.path!=="/journal?tab=trades").filter(t=>t.path!==c).slice(0,d);return s.length===0?null:a.jsxs("div",{className:`${o[e].card} rounded-lg p-6 shadow-md`,children:[a.jsx("h3",{className:`text-lg font-semibold ${o[e].text} mb-4`,children:"Related Features"}),a.jsx("div",{className:"space-y-3",children:s.map(t=>{const p=t.icon;return a.jsxs(h,{to:t.path,className:`flex items-start space-x-3 p-3 rounded-lg ${o[e].cardHover} group transition-all duration-200`,title:`Navigate to ${t.title}`,children:[a.jsx(p,{className:`w-5 h-5 mt-0.5 ${o[e].text} opacity-75 group-hover:opacity-100`}),a.jsxs("div",{className:"flex-1 min-w-0",children:[a.jsx("h4",{className:`text-sm font-medium ${o[e].text} group-hover:text-blue-600 transition-colors`,children:t.title}),a.jsx("p",{className:`text-xs ${o[e].text} opacity-75 mt-1`,children:t.description})]}),a.jsx(m,{className:`w-4 h-4 ${o[e].text} opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all`})]},t.path)})})]})}export{j as C,w as E,b as R,x as U,k as a};
