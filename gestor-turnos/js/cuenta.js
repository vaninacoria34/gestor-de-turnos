document.addEventListener('DOMContentLoaded',async()=>{
 if(!await UI.iniciar())return;
 UI.el('form-cuenta').addEventListener('submit',async event=>{
 event.preventDefault();const f=event.target.elements,boton=event.target.querySelector('button');
 if(f.nueva.value!==f.confirmar.value){UI.mensaje('Las contraseñas no coinciden.',true);return;}
 boton.disabled=true;
 try{await API.put('/auth/cuenta',{password_actual:f.actual.value,password_nueva:f.nueva.value});await API.logout();}
 catch(e){UI.mensaje(e.message,true);}finally{boton.disabled=false;}
 });
});