/* Accessible select presentation. Native values and existing input/change handlers remain authoritative. */
(function (root) {
  let opened = null, serial = 0;
  function close(restoreFocus = false) {
    if (!opened) return;
    const {button, popup} = opened;
    opened = null;
    popup.remove();
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    button.removeAttribute('aria-controls');
    if (restoreFocus && button.isConnected) button.focus({preventScroll:true});
  }
  function mark(index) {
    const s = opened;
    if (!s || !s.options[index] || s.options[index].disabled) return;
    s.active = index;
    s.nodes.forEach((node,i)=>node.classList.toggle('is-active',i===index));
    s.button.setAttribute('aria-activedescendant',s.nodes[index].id);
    s.nodes[index].scrollIntoView({block:'nearest'});
  }
  function move(step) {
    const s = opened;
    if (!s) return;
    for (let n=1;n<=s.options.length;n++) {
      const i=(s.active + step*n + s.options.length*2)%s.options.length;
      if (!s.options[i].disabled) {mark(i);break;}
    }
  }
  function choose(index) {
    const s=opened;
    if (!s || s.select.disabled || s.options[index]?.disabled) return;
    const value=s.options[index].value, changed=s.select.value!==value, key=s.button.dataset.selectFor;
    close(false);
    if (changed) {
      s.select.value=value;
      s.button.querySelector('.select-value').textContent=s.options[index].text;
      s.button.setAttribute('aria-label',s.caption+': '+s.options[index].text);
      s.select.dispatchEvent(new Event('input',{bubbles:true}));
      if (s.select.isConnected) s.select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    document.querySelector(`.select-trigger[data-select-for="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
  }
  function open(select, button, caption) {
    if (select.disabled) return;
    if (opened?.button===button) {close(true);return;}
    close(false);
    const popup=document.createElement('div'), id='select-list-'+(++serial),
      options=[...select.options], nodes=[];
    popup.className='select-popup';popup.id=id;popup.setAttribute('role','listbox');
    popup.setAttribute('aria-label',caption);
    options.forEach((option,i)=>{
      const node=document.createElement('div');
      node.className='select-option';node.id=id+'-'+i;node.dataset.index=String(i);
      node.setAttribute('role','option');node.setAttribute('aria-selected',String(i===select.selectedIndex));
      node.setAttribute('aria-disabled',String(option.disabled));
      const text=document.createElement('span');text.textContent=option.text;node.append(text);
      node.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')mark(i);});
      node.addEventListener('click',()=>choose(i));
      popup.append(node);nodes.push(node);
    });
    popup.addEventListener('pointerdown',e=>e.preventDefault());
    document.body.append(popup);
    const r=button.getBoundingClientRect(), v=window.visualViewport,
      left=v?.offsetLeft||0, top=v?.offsetTop||0,
      width=v?.width||innerWidth, height=v?.height||innerHeight,
      w=Math.min(Math.max(r.width,240),width-16);
    popup.style.width=w+'px';
    popup.style.left=Math.max(left+8,Math.min(r.left,left+width-w-8))+'px';
    const natural=popup.scrollHeight+2, below=top+height-r.bottom-12, above=r.top-top-12,
      down=below>=natural||below>=above, space=Math.max(40,down?below:above), h=Math.min(natural,space);
    popup.style.maxHeight=space+'px';
    popup.style.top=Math.max(top+8,Math.min(down?r.bottom+6:r.top-h-6,top+height-h-8))+'px';
    opened={select,button,popup,caption,options,nodes,active:select.selectedIndex,search:'',lastKey:0};
    button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',id);
    button.focus({preventScroll:true});
    const initial=select.selectedIndex>=0&&!options[select.selectedIndex].disabled?select.selectedIndex:options.findIndex(o=>!o.disabled);
    if(initial>=0)mark(initial);
  }
  function keydown(e,select,button,caption) {
    if (select.disabled || e.ctrlKey || e.metaKey) return;
    if (e.key==='Tab') {close(false);return;}
    if (e.key==='Escape') {if(opened){e.preventDefault();close(true);}return;}
    if (['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
      e.preventDefault();
      if (!opened || opened.button!==button) {
        open(select,button,caption);
        if(e.key==='Home')mark(opened.options.findIndex(o=>!o.disabled));
        if(e.key==='End')mark(opened.options.findLastIndex(o=>!o.disabled));
      } else if(e.key==='Enter'||e.key===' ') choose(opened.active);
      else if(e.key==='ArrowDown'||e.key==='ArrowUp')move(e.key==='ArrowDown'?1:-1);
      else mark(e.key==='Home'?opened.options.findIndex(o=>!o.disabled):opened.options.findLastIndex(o=>!o.disabled));
    } else if (e.key.length===1&&!e.altKey) {
      e.preventDefault();
      if(!opened||opened.button!==button)open(select,button,caption);
      const s=opened, now=performance.now();
      s.search=now-s.lastKey>700?'':s.search;s.lastKey=now;
      s.search+=e.key.toLocaleLowerCase('ru-RU');
      let i=s.options.findIndex(o=>!o.disabled&&o.text.toLocaleLowerCase('ru-RU').startsWith(s.search));
      if(i<0){s.search=e.key.toLocaleLowerCase('ru-RU');i=s.options.findIndex(o=>!o.disabled&&o.text.toLocaleLowerCase('ru-RU').startsWith(s.search));}
      if(i>=0)mark(i);
    }
  }
  function enhance(container) {
    for (const select of container.querySelectorAll('select:not([data-select-enhanced])')) {
      const label=select.closest('label'), caption=label?.querySelector(':scope > span')?.textContent.trim()||
        [...(label?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||'Выбрать вариант',
        key=select.id||'setting-'+select.dataset.setting,
        wrapper=document.createElement('div'), button=document.createElement('button'),
        value=document.createElement('span'), chevron=document.createElement('span');
      wrapper.className='select-control';button.className='select-trigger';button.type='button';
      button.dataset.selectFor=key;button.setAttribute('role','combobox');
      button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
      value.className='select-value';value.textContent=select.selectedOptions[0]?.text||'';
      button.setAttribute('aria-label',caption+': '+value.textContent);button.disabled=select.disabled;
      chevron.className='select-chevron';chevron.setAttribute('aria-hidden','true');
      button.append(value,chevron);
      select.before(wrapper);wrapper.append(select,button);
      select.dataset.selectEnhanced='true';select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      button.addEventListener('click',()=>open(select,button,caption));
      button.addEventListener('keydown',e=>keydown(e,select,button,caption));
      label?.addEventListener('click',e=>{
        if(button.contains(e.target))return;
        e.preventDefault();open(select,button,caption);
      });
    }
  }
  document.addEventListener('pointerdown',e=>{
    if(opened&&!opened.button.contains(e.target)&&!opened.popup.contains(e.target))close(false);
  },true);
  window.addEventListener('blur',()=>close(false));
  window.addEventListener('resize',()=>close(false));
  window.visualViewport?.addEventListener('resize',()=>close(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close(false);});
  root.VahtaSelect={enhance,close};
})(globalThis);
