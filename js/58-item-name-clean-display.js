/* Display-only legacy item-name separator cleanup. Keep '|'-delimited identity keys intact. */
(()=>{'use strict';
  const replacement=s=>{
    let v=String(s).replace(/\s+\|\s+/g,' ');
    // Only remove forward slashes when the text represents an item specification.
    // Never modify URLs, dates, 'pcs/roll', prices, or internal identity keys.
    const isItemSpec=/\b\d+(?:\.\d+)?\s*mm\s*[x×]\s*\d+(?:\.\d+)?\s*mm\s*\/\s*/i.test(v)
      || /\b(?:DT ECO|DT TOP|ELP HYBRID|TT|PVC|HIGHSTICK)\s*\/\s*\d+\s*UP\b/i.test(v);
    if(isItemSpec) v=v.replace(/\s+\/\s+(?=(?:DT ECO|DT TOP|ELP HYBRID|TT|PVC|HIGHSTICK|\d+\s*UP|\d+\s*(?:PCS|LABELS)\b))/gi,' ');
    return v.replace(/ {2,}/g,' ');
  };
  const skip=new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','INPUT','SVG']);
  const skipSelector='script,style,noscript,code,pre,textarea,input,svg';
  const hasDirtyToken=val=>!!val&&(/\s\|\s/.test(val)||/mm\s*\//i.test(val)||/\bUP\s*\//i.test(val));
  function cleanTextNode(node){
    const cur=node.nodeValue;
    if(!hasDirtyToken(cur))return;
    const next=replacement(cur);
    if(next!==cur)node.nodeValue=next;
  }
  function clean(root){
    if(!root||root.nodeType===8)return;
    if(root.nodeType===3){
      const parent=root.parentElement;
      if(parent&&(skip.has(parent.tagName)||parent.closest(skipSelector)))return;
      cleanTextNode(root);
      return;
    }
    if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
    if(root.nodeType===1&&skip.has(root.tagName))return;
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const list=[];while(walk.nextNode())list.push(walk.currentNode);
    for(const node of list){
      const parent=node.parentElement;
      if(parent&&parent.closest(skipSelector))continue;
      cleanTextNode(node);
    }
  }
  function start(){
    clean(document.body);
    const observer=new MutationObserver(changes=>{
      for(const change of changes){
        if(change.type==='characterData'){clean(change.target);continue;}
        for(const node of change.addedNodes)clean(node);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    window.scCleanItemNameDisplayV1101=replacement;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
