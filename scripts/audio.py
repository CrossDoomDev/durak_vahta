# Original synthesized sound design, no sampled or external recordings.
import wave,math,random,struct
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public/assets/audio';root.mkdir(exist_ok=True)
sr=22050;random.seed(45)
def write(name,seconds,fn):
 with wave.open(str(root/(name+'.wav')),'w') as w:
  w.setparams((1,2,sr,0,'NONE','not compressed'))
  w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,fn(i/sr)))*27000)) for i in range(int(sr*seconds))))
for name,freq,duration in [('button',600,.08),('card',240,.15),('cover',360,.16),('take',150,.25),('deal',300,.3),('event',520,.65),('win',660,.9)]:
 write(name,duration,lambda t,f=freq,d=duration:(math.sin(2*math.pi*(f-100*t)*t)*.15+random.uniform(-1,1)*(.12 if f<400 else .02))*math.exp(-t/(d*.2)))
notes=[146.83,174.61,220,196,130.81,174.61,196,220]
def music(t):
 beat=int(t*2);dt=t-beat*.5;f=notes[(beat//2)%len(notes)]
 return (math.sin(2*math.pi*f*dt)+.3*math.sin(2*math.pi*2*f*dt)+.13*math.sin(2*math.pi*3*f*dt))*.13*math.exp(-dt*7)*min(1,t*5)*min(1,(16-t)*5)
write('music',16,music)
write('wind',3,lambda t:random.uniform(-1,1)*.035*(.7+.3*math.sin(t*2)))
write('kettle',1,lambda t:math.sin(2*math.pi*1800*t)*.025*math.sin(math.pi*t)**2)
