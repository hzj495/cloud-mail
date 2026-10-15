import{E as P}from"./el-alert-cdE6Pemz.js";import{E as J}from"./el-scrollbar-Bi70bHwd.js";import{E as Q}from"./el-image-viewer-2Xir5Sua.js";import{u as G,f as L}from"./index-LsWL0xcN.js";import{E as K}from"./index-9ETsQ2MD.js";import{L as X,u as Y,P as Z,a as U,N as ee}from"./index-MEKUJjae.js";import{_ as z}from"./_plugin-vue_export-helper-DlAUqK2U.js";import{d as j,w as H,o as n,f,g as s,l as x,Q as te,b as y,u as t,k as D,c as m,h as u,a as A,N as se,t as i,q as oe,F as ae,i as ne,E as ie,n as le}from"./runtime-core.esm-bundler-D6DsMCP-.js";import{a as ce,b as re}from"./email-bnWb3WaE.js";import{I as h}from"./iconify-BNPp--uU.js";import{u as de}from"./email-DJS2hOkE.js";import{u as me}from"./account-BeUMM4tw.js";import{f as ue}from"./day-CUFbkJQc.js";import{E as T,s as he,a as pe}from"./star-BrpYOsQ2.js";import{f as fe,g as _e}from"./file-utils-BIuIyNKs.js";import{g as ge}from"./icon-utils-DTjLlsLE.js";import{a as ye}from"./all-email-D3pf4LQR.js";import"./vnode-BnI4eZoD.js";import"./index-D_5AmGO8.js";import"./use-form-item-j0IB2gLk.js";import"./index-B-jNRDjN.js";import"./debounce-D9Vw7Lz1.js";const we={__name:"index",props:{html:{type:String,required:!0}},setup(R){const _=R,k=x(null),w=x(null);let a=null;function v(){if(!a)return;const p=/<body[^>]*style="([^"]*)"[^>]*>/i,l=_.html.match(p),c=l?l[1]:"",g=_.html.replace(/<\/?body[^>]*>/gi,"");a.innerHTML=`
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: -apple-system, Inter, BlinkMacSystemFont,
                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #13181D;
        word-break: break-word;
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: #0E70DF;
      }

      .shadow-content {
        background: #FFFFFF;
        width: fit-content;
        height: fit-content;
        min-width: 100%;
        ${c||""} /* 注入 body 的 style */
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

    </style>
    <div class="shadow-content">
      ${g}
    </div>
  `}function e(){if(!a||!w.value)return;const p=w.value,l=a.querySelector(".shadow-content");if(!l)return;const c=p.offsetWidth,g=l.scrollWidth;if(g===0)return;const S=c/g,b=a.host;b.style.zoom=S}return j(()=>{a=k.value.attachShadow({mode:"open"}),v(),e()}),H(()=>_.html,()=>{v(),e()}),(p,l)=>(n(),f("div",{class:"content-box",ref_key:"contentBox",ref:w},[s("div",{ref_key:"container",ref:k,class:"content-html"},null,512)],512))}},ve=z(we,[["__scopeId","data-v-cc2b119a"]]),ke={class:"box"},Se={class:"header-actions"},be={key:0,class:"star"},Ie={class:"container"},Ee={class:"email-title"},Ce={class:"content"},De={class:"email-info"},xe={class:"send"},Re={class:"send-source"},Be={class:"send-name"},$e={class:"send-name-title"},Fe={class:"receive"},Ne={class:"source"},Me={class:"receive-email"},Le={class:"date"},Ue={key:1,class:"email-text"},Ae={key:0,class:"att"},Te={class:"att-title"},ze={class:"att-box"},je=["onClick"],He=["onClick"],Ve={class:"att-size"},We={class:"opt-icon att-icon"},qe=["href"],Oe={__name:"index",setup(R){const _=X(),k=Y(),w=me(),a=de(),v=Z(),e=a.contentData.email,p=x(!1),l=le([]),{t:c}=G();H(()=>w.currentAccountId,()=>{F()}),j(()=>{a.contentData.showUnread&&e.unread===T.UNREAD&&(e.unread=T.READ,ce([e.emailId]))}),te(()=>{a.contentData.showUnread=!1});function g(){_.writerRef.openReply(e)}function S(){_.writerRef.openForward(e)}function b(o){return o?JSON.parse(o).message:""}function V(o){o=o||"";const r=k.settings.r2Domain;return o.replace(/{{domain}}/g,ee(r)+"/")}function I(o){if(!B(o))return;const r=U(o);l.length=0,l.push(r),p.value=!0}function B(o){return["png","jpg","jpeg","bmp","gif","jfif"].includes(_e(o))}function W(o){return o=JSON.parse(o),o.map(r=>r.address).join(", ")}function $(){e.isStar?(e.isStar=0,he(e.emailId).then(()=>{e.isStar=0,a.cancelStarEmailId=e.emailId,setTimeout(()=>a.cancelStarEmailId=0),a.starScroll?.deleteEmail([e.emailId])}).catch(o=>{console.error(o),e.isStar=1})):(e.isStar=1,pe(e.emailId).then(()=>{e.isStar=1,a.addStarEmailId=e.emailId,setTimeout(()=>a.addStarEmailId=0),a.starScroll?.addItem(e)}).catch(o=>{console.error(o),e.isStar=0}))}const F=()=>{v.back()},q=()=>{K.confirm(c("delEmailConfirm"),{confirmButtonText:c("confirm"),cancelButtonText:c("cancel"),type:"warning"}).then(()=>{a.contentData.delType==="logic"?re(e.emailId).then(()=>{L({message:c("delSuccessMsg"),type:"success",plain:!0}),a.deleteIds=[e.emailId]}):ye(e.emailId).then(()=>{L({message:c("delSuccessMsg"),type:"success",plain:!0}),a.deleteIds=[e.emailId]}),v.back()})};return(o,r)=>{const E=P,N=J,O=Q,C=se("perm");return n(),f("div",ke,[s("div",Se,[y(t(h),{class:"icon",icon:"material-symbols-light:arrow-back-ios-new",width:"20",height:"20",onClick:F}),D(y(t(h),{class:"icon",icon:"uiw:delete",width:"16",height:"16",onClick:q},null,512),[[C,"email:delete"]]),t(a).contentData.showStar?(n(),f("span",be,[t(e).isStar?(n(),m(t(h),{key:0,class:"icon",onClick:$,icon:"fluent-color:star-16",width:"20",height:"20"})):(n(),m(t(h),{key:1,class:"icon",onClick:$,icon:"solar:star-line-duotone",width:"18",height:"18"}))])):u("",!0),t(a).contentData.showReply?D((n(),m(t(h),{key:1,class:"icon",onClick:g,icon:"la:reply",width:"21",height:"21"},null,512)),[[C,"email:send"]]):u("",!0),t(a).contentData.showReply?D((n(),m(t(h),{key:2,class:"icon",onClick:S,icon:"iconoir:arrow-up-right",width:"20",height:"20"},null,512)),[[C,"email:send"]]):u("",!0)]),r[1]||(r[1]=s("div",null,null,-1)),y(N,{class:"scrollbar"},{default:A(()=>[s("div",Ie,[s("div",Ee,i(t(e).subject),1),s("div",Ce,[s("div",De,[s("div",null,[s("div",xe,[s("span",Re,i(o.$t("from")),1),s("div",Be,[s("span",$e,i(t(e).name),1),s("span",null,"<"+i(t(e).sendEmail)+">",1)])]),s("div",Fe,[s("span",Ne,i(o.$t("recipient")),1),s("span",Me,i(W(t(e).recipient)),1)]),s("div",Le,[s("div",null,i(t(ue)(t(e).createTime)),1)])]),t(e).status===3?(n(),m(E,{key:0,closable:!1,title:b(t(e).message),class:"email-msg",type:"error","show-icon":""},null,8,["title"])):u("",!0),t(e).status===4?(n(),m(E,{key:1,closable:!1,title:o.$t("complained"),class:"email-msg",type:"warning","show-icon":""},null,8,["title"])):u("",!0),t(e).status===5?(n(),m(E,{key:2,closable:!1,title:o.$t("delayed"),class:"email-msg",type:"warning","show-icon":""},null,8,["title"])):u("",!0)]),y(N,{class:oe(["htm-scrollbar",t(e).attList.length===0?"bottom-distance":""])},{default:A(()=>[t(e).content?(n(),m(ve,{key:0,class:"shadow-html",html:V(t(e).content)},null,8,["html"])):(n(),f("pre",Ue,i(t(e).text),1))]),_:1},8,["class"]),t(e).attList.length>0?(n(),f("div",Ae,[s("div",Te,[s("span",null,i(o.$t("attachments")),1),s("span",null,i(o.$t("attCount",{total:t(e).attList.length})),1)]),s("div",ze,[(n(!0),f(ae,null,ne(t(e).attList,d=>(n(),f("div",{class:"att-item",key:d.attId},[s("div",{class:"att-icon",onClick:M=>I(d.key)},[y(t(h),ie({ref_for:!0},t(ge)(d.filename)),null,16)],8,je),s("div",{class:"att-name",onClick:M=>I(d.key)},i(d.filename),9,He),s("div",Ve,i(t(fe)(d.size)),1),s("div",We,[B(d.filename)?(n(),m(t(h),{key:0,icon:"hugeicons:view",width:"22",height:"22",onClick:M=>I(d.key)},null,8,["onClick"])):u("",!0),s("a",{href:t(U)(d.key),download:""},[y(t(h),{icon:"system-uicons:push-down",width:"22",height:"22"})],8,qe)])]))),128))])])):u("",!0)])])]),_:1}),p.value?(n(),m(O,{key:0,"url-list":l,"show-progress":"",onClose:r[0]||(r[0]=d=>p.value=!1)},null,8,["url-list"])):u("",!0)])}}},pt=z(Oe,[["__scopeId","data-v-c7fbaff5"]]);export{pt as default};
