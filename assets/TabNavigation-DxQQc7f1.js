import{c,g as y,j as e,d as i}from"./index-ByFJaVVd.js";import{r as m}from"./vendor-react-LqbDjzi_.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=c("Activity",[["path",{d:"M22 12h-4l-3 9L9 3l-3 9H2",key:"d5dnw9"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=c("AlertCircle",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=c("AlertTriangle",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z",key:"c3ski4"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=c("Briefcase",[["rect",{width:"20",height:"14",x:"2",y:"7",rx:"2",ry:"2",key:"eto64e"}],["path",{d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"zwj3tp"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=c("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=c("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=c("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=c("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=c("Filter",[["polygon",{points:"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3",key:"1yg77f"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const B=c("Plus",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=c("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]),T=new Map;function se({userId:r,theme:a,selectedAccountId:n,onAccountChange:d,mode:x,preferOptions:k=!0,refreshKey:S,showCreate:F=!0}){const[b,D]=m.useState([]),[_,w]=m.useState(!1),[z,j]=m.useState(!1),[N,$]=m.useState(""),[H,C]=m.useState(""),[q,M]=m.useState(!1),f=x??(k?"options":"stocks"),A=`${f}:${r}`,g=m.useCallback(async(s=!1)=>{M(!0);const l=T.get(A);if(!s&&l&&l.length>0){D(l);const p=n&&l.some(t=>(t.alias||t.id)===n);if(!n||!p){const t=l.find(u=>u.is_default)||l[0];if(t){const u=t.alias||t.id;u!==n&&d(u)}}M(!1);return}const O=p=>{const t=new Map;for(const u of p)for(const h of u){const v=h.alias||h.id;if(!v)continue;const R=t.get(v);if(!R){t.set(v,h);continue}!R.is_default&&h.is_default&&t.set(v,h)}return Array.from(t.values())};let o=[];if(f==="all"){const[p,t]=await Promise.all([y.getAccounts(r),y.getOptionsAccounts(r)]);o=O([p.data||[],t.data||[]])}else f==="options"?(o=(await y.getOptionsAccounts(r)).data||[],o.length===0&&(o=(await y.getAccounts(r)).data||[])):o=(await y.getAccounts(r)).data||[];if(o.length>0){D(o),T.set(A,o);const p=n&&o.some(t=>(t.alias||t.id)===n);if((!n||!p)&&o.length>0){const t=o.find(h=>h.is_default)||o[0],u=t.alias||t.id;u!==n&&d(u)}}M(!1)},[r,f,A,n,d]);m.useEffect(()=>{g(!1)},[g]),m.useEffect(()=>{typeof S=="number"&&g(!0)},[S]);const P=async()=>{if(!N.trim())return;const s={user_id:r,name:N,description:H,is_default:b.length===0,currency:"USD"},l=await y.createAccount(s);l.data&&(await g(),d(l.data.alias||l.data.id),$(""),C(""),j(!1))},E=async s=>{await y.setDefaultAccount(r,s),await g()},L=b.find(s=>s.alias===n||s.id===n);return e.jsxs("div",{className:"relative",children:[e.jsxs("button",{onClick:()=>w(!_),className:`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors duration-200 max-w-full min-w-0 ${i[a].primary} ${i[a].text}`,children:[e.jsx(U,{className:"w-4 h-4"}),e.jsx("span",{className:"font-medium truncate max-w-[12rem] sm:max-w-[16rem]",children:L?L.name:"选择账户"})]}),_&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"fixed inset-0 z-10",onClick:()=>w(!1)}),e.jsx("div",{className:`absolute top-full mt-2 right-0 w-80 rounded-lg shadow-lg border ${i[a].card} ${i[a].border} z-20 overflow-hidden`,children:e.jsxs("div",{className:"p-4",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:`text-lg font-semibold ${i[a].text}`,children:"账户管理"}),F&&f!=="all"&&e.jsx("button",{onClick:()=>j(!z),className:"p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200",title:"添加新账户",children:e.jsx(B,{className:"w-5 h-5"})})]}),F&&f!=="all"&&z&&e.jsxs("div",{className:"mb-4 space-y-3 animate-fadeIn",children:[e.jsx("input",{type:"text",placeholder:"账户名称",value:N,onChange:s=>$(s.target.value),className:`w-full px-3 py-2 rounded-md border ${i[a].input} ${i[a].text} ${i[a].border} focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}),e.jsx("input",{type:"text",placeholder:"描述 (可选)",value:H,onChange:s=>C(s.target.value),className:`w-full px-3 py-2 rounded-md border ${i[a].input} ${i[a].text} ${i[a].border} focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{onClick:P,className:`flex-1 px-3 py-2 rounded-md ${i[a].primary} text-white hover:opacity-90 transition-opacity duration-200`,children:"创建"}),e.jsx("button",{onClick:()=>{j(!1),$(""),C("")},className:`flex-1 px-3 py-2 rounded-md ${i[a].secondary} hover:opacity-90 transition-opacity duration-200`,children:"取消"})]})]}),e.jsx("div",{className:"space-y-1.5",children:q?e.jsxs("div",{className:`text-center py-4 ${i[a].text} opacity-60`,children:[e.jsx("div",{className:"animate-pulse flex justify-center",children:e.jsx("div",{className:"h-5 w-5 border-t-2 border-b-2 border-blue-500 rounded-full animate-spin"})}),e.jsx("div",{className:"mt-2",children:"加载账户中..."})]}):b.length===0?e.jsx("div",{className:`text-center py-4 ${i[a].text} opacity-60`,children:"暂无账户，请创建一个新账户开始使用"}):b.map(s=>e.jsxs("div",{className:`flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700 ${n===(s.alias||s.id)?"bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500":""}`,onClick:()=>{d(s.alias||s.id),w(!1)},children:[e.jsxs("div",{className:"flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:`font-medium ${i[a].text}`,children:s.name}),s.is_default&&e.jsx("span",{className:"text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",children:"默认"})]}),s.description&&e.jsx("div",{className:`text-sm ${i[a].text} opacity-60 truncate max-w-[200px]`,children:s.description})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[f!=="all"&&!s.is_default&&e.jsx("button",{onClick:l=>{l.stopPropagation(),E(s.alias||s.id)},className:`text-xs px-2 py-1 rounded-full transition-colors duration-200 hover:bg-blue-100 dark:hover:bg-blue-900 ${i[a].secondary}`,children:"设为默认"}),n===(s.alias||s.id)&&e.jsx(V,{className:"w-5 h-5 text-green-500"})]})]},s.id))})]})})]})]})}function ae(r,a,n=2){const d=Math.abs(r).toLocaleString("en-US",{minimumFractionDigits:n,maximumFractionDigits:n,useGrouping:!0});return a.position==="before"?`${a.symbol}${d}`:`${d}${a.symbol}`}function te({tabs:r,activeTab:a,theme:n,onTabChange:d}){return e.jsx("div",{className:"overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0",children:e.jsx("div",{className:"flex space-x-2 min-w-max sm:min-w-0",children:r.map(x=>{const k=x.icon;return e.jsxs("button",{onClick:()=>d(x.id),className:`inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${a===x.id?i[n].primary:i[n].secondary}`,children:[e.jsx(k,{className:"w-4 h-4 sm:mr-2"}),e.jsx("span",{className:"hidden sm:inline",children:x.name})]},x.id)})})})}export{K as A,U as B,W as C,I as F,B as P,ee as R,te as T,V as a,Y as b,X as c,J as d,se as e,ae as f,Q as g};
