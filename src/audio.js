(function(root){
class VahtaAudio{
 constructor(settings){this.settings=settings;this.unlocked=false;this.paused=false;this.pool=new Set();this.music=null;}
 unlock(){if(this.unlocked)return;this.unlocked=true;this.update(this.settings);}
 update(settings){this.settings=settings;if(!this.unlocked)return;if(!this.music){this.music=new Audio('public/assets/audio/music.wav');this.music.loop=true;}this.music.volume=settings.music*.45;if(this.paused||!settings.music)this.music.pause();else if(this.music.paused)this.music.play().catch(()=>{});for(const a of this.pool)a.volume=settings.sfx;if(!settings.sfx)for(const a of this.pool)a.pause();}
 play(name){if(!this.unlocked||this.paused||!this.settings.sfx)return;const a=new Audio('public/assets/audio/'+name+'.wav');a.volume=this.settings.sfx*.55;this.pool.add(a);a.onended=a.onerror=()=>this.pool.delete(a);a.play().catch(()=>this.pool.delete(a));}
 pause(value){this.paused=value;if(value)for(const a of this.pool)a.pause();this.update(this.settings);}
}
root.VahtaAudio=VahtaAudio;
})(globalThis);
