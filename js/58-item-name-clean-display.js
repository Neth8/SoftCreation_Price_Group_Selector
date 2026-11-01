/* Display-only legacy item-name separator cleanup. Keep '|'-delimited identity keys intact. */
(()=>{'use strict';
  const replacement=s=>String(s).replace(/\s*\|\s*/g,' ').replace(/ {2,}/g,' ');
  const skip=new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','INPUT','SVG']);
  function clean(root){
    if(!root||root.nodeType===8)return;
    if(root.nodeType===3){
      const parent=root.parentElement;
      if(parent&&skip.has(parent.tagName))return;
      if(root.nodeValue&&/\s\|\s/.test(root.nodeValue))root.nodeValue=replacement(root.nodeValue);
      return;
    }
    if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
    if(root.nodeType===1&&skip.has(root.tagName))return;
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const list=[];while(walk.nextNode())list.push(walk.currentNode);
    for(const node of list){const parent=node.parentElement;if(parent&&parent.closest('script,style,noscript,code,pre,textarea,svg'))continue;
      if(node.nodeValue&&/\s\|\s/.test(node.nodeValue))node.nodeValue=replacement(node.nodeValue);
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
