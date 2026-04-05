import{c as r,h as y,j as e,d as i}from"./index-DxX9VMHE.js";import{r as u}from"./vendor-react-LqbDjzi_.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=r("Activity",[["path",{d:"M22 12h-4l-3 9L9 3l-3 9H2",key:"d5dnw9"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=r("AlertTriangle",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z",key:"c3ski4"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=r("Briefcase",[["rect",{width:"20",height:"14",x:"2",y:"7",rx:"2",ry:"2",key:"eto64e"}],["path",{d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"zwj3tp"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=r("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=r("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=r("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=r("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=r("EyeOff",[["path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24",key:"1jxqfv"}],["path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",key:"9wicm4"}],["path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",key:"1jreej"}],["line",{x1:"2",x2:"22",y1:"2",y2:"22",key:"a6p6uj"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=r("Eye",[["path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",key:"rwhkz3"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=r("Filter",[["polygon",{points:"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3",key:"1yg77f"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=r("Plus",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=r("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]),L=new Map;function ae({userId:c,theme:a,selectedAccountId:n,onAccountChange:f,mode:x,preferOptions:b=!0,refreshKey:S,showCreate:E=!0}){const[g,_]=u.useState([]),[z,j]=u.useState(!1),[D,w]=u.useState(!1),[N,$]=u.useState(""),[F,M]=u.useState(""),[P,C]=u.useState(!1),m=x??(b?"options":"stocks"),A=`${m}:${c}`,v=u.useCallback(async(s=!1)=>{C(!0);const o=L.get(A);if(!s&&o&&o.length>0){_(o);const d=n&&o.some(t=>(t.alias||t.id)===n);if(!n||!d){const t=o.find(p=>p.is_default)||o[0];if(t){const p=t.alias||t.id;p!==n&&f(p)}}C(!1);return}const B=d=>{const t=new Map;for(const p of d)for(const h of p){const k=h.alias||h.id;if(!k)continue;const R=t.get(k);if(!R){t.set(k,h);continue}!R.is_default&&h.is_default&&t.set(k,h)}return Array.from(t.values())};let l=[];if(m==="all"){const[d,t]=await Promise.all([y.getAccounts(c),y.getOptionsAccounts(c)]);l=B([d.data||[],t.data||[]])}else m==="options"?(l=(await y.getOptionsAccounts(c)).data||[],l.length===0&&(l=(await y.getAccounts(c)).data||[])):l=(await y.getAccounts(c)).data||[];if(l.length>0){_(l),L.set(A,l);const d=n&&l.some(t=>(t.alias||t.id)===n);if((!n||!d)&&l.length>0){const t=l.find(h=>h.is_default)||l[0],p=t.alias||t.id;p!==n&&f(p)}}C(!1)},[c,m,A,n,f]);u.useEffect(()=>{v(!1)},[v]),u.useEffect(()=>{typeof S=="number"&&v(!0)},[S]);const T=async()=>{if(!N.trim())return;const s={user_id:c,name:N,description:F,is_default:g.length===0,currency:"USD"},o=await y.createAccount(s);o.data&&(await v(),f(o.data.alias||o.data.id),$(""),M(""),w(!1))},q=async s=>{await y.setDefaultAccount(c,s),await v()},O=g.find(s=>s.alias===n||s.id===n);return e.jsxs("div",{className:"relative",children:[e.jsxs("button",{onClick:()=>j(!z),className:`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors duration-200 ${i[a].primary} ${i[a].text}`,children:[e.jsx(U,{className:"w-4 h-4"}),e.jsx("span",{className:"font-medium",children:O?O.name:"选择账户"})]}),z&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"fixed inset-0 z-10",onClick:()=>j(!1)}),e.jsx("div",{className:`absolute top-full mt-2 right-0 w-80 rounded-lg shadow-lg border ${i[a].card} ${i[a].border} z-20 overflow-hidden`,children:e.jsxs("div",{className:"p-4",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:`text-lg font-semibold ${i[a].text}`,children:"账户管理"}),E&&m!=="all"&&e.jsx("button",{onClick:()=>w(!D),className:"p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200",title:"添加新账户",children:e.jsx(H,{className:"w-5 h-5"})})]}),E&&m!=="all"&&D&&e.jsxs("div",{className:"mb-4 space-y-3 animate-fadeIn",children:[e.jsx("input",{type:"text",placeholder:"账户名称",value:N,onChange:s=>$(s.target.value),className:`w-full px-3 py-2 rounded-md border ${i[a].input} ${i[a].text} ${i[a].border} focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}),e.jsx("input",{type:"text",placeholder:"描述 (可选)",value:F,onChange:s=>M(s.target.value),className:`w-full px-3 py-2 rounded-md border ${i[a].input} ${i[a].text} ${i[a].border} focus:ring-2 focus:ring-opacity-50 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200`}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{onClick:T,className:`flex-1 px-3 py-2 rounded-md ${i[a].primary} text-white hover:opacity-90 transition-opacity duration-200`,children:"创建"}),e.jsx("button",{onClick:()=>{w(!1),$(""),M("")},className:`flex-1 px-3 py-2 rounded-md ${i[a].secondary} hover:opacity-90 transition-opacity duration-200`,children:"取消"})]})]}),e.jsx("div",{className:"space-y-1.5",children:P?e.jsxs("div",{className:`text-center py-4 ${i[a].text} opacity-60`,children:[e.jsx("div",{className:"animate-pulse flex justify-center",children:e.jsx("div",{className:"h-5 w-5 border-t-2 border-b-2 border-blue-500 rounded-full animate-spin"})}),e.jsx("div",{className:"mt-2",children:"加载账户中..."})]}):g.length===0?e.jsx("div",{className:`text-center py-4 ${i[a].text} opacity-60`,children:"暂无账户，请创建一个新账户开始使用"}):g.map(s=>e.jsxs("div",{className:`flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700 ${n===(s.alias||s.id)?"bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500":""}`,onClick:()=>{f(s.alias||s.id),j(!1)},children:[e.jsxs("div",{className:"flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:`font-medium ${i[a].text}`,children:s.name}),s.is_default&&e.jsx("span",{className:"text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",children:"默认"})]}),s.description&&e.jsx("div",{className:`text-sm ${i[a].text} opacity-60 truncate max-w-[200px]`,children:s.description})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[m!=="all"&&!s.is_default&&e.jsx("button",{onClick:o=>{o.stopPropagation(),q(s.alias||s.id)},className:`text-xs px-2 py-1 rounded-full transition-colors duration-200 hover:bg-blue-100 dark:hover:bg-blue-900 ${i[a].secondary}`,children:"设为默认"}),n===(s.alias||s.id)&&e.jsx(V,{className:"w-5 h-5 text-green-500"})]})]},s.id))})]})})]})]})}function te({tabs:c,activeTab:a,theme:n,onTabChange:f}){return e.jsx("div",{className:"overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0",children:e.jsx("div",{className:"flex space-x-2 min-w-max sm:min-w-0",children:c.map(x=>{const b=x.icon;return e.jsxs("button",{onClick:()=>f(x.id),className:`inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${a===x.id?i[n].primary:i[n].secondary}`,children:[e.jsx(b,{className:"w-4 h-4 sm:mr-2"}),e.jsx("span",{className:"hidden sm:inline",children:x.name})]},x.id)})})})}export{J as A,U as B,W as C,Y as E,ee as F,H as P,se as R,te as T,V as a,X as b,ae as c,Q as d,K as e,I as f};
