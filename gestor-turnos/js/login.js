document.getElementById('mostrar-password').addEventListener('click',event=>{
 const input=document.getElementById('password'),mostrar=input.type==='password';
 input.type=mostrar?'text':'password';event.target.textContent=mostrar?'Ocultar':'Mostrar';event.target.setAttribute('aria-pressed',String(mostrar));event.target.setAttribute('aria-label',mostrar?'Ocultar contraseña':'Mostrar contraseña');
});
document.getElementById('form-login').addEventListener('submit',async event=>{
 event.preventDefault();const boton=document.getElementById('entrar'),error=document.getElementById('error');
 boton.disabled=true;boton.textContent='Ingresando…';error.textContent='';
 try{await API.login(document.getElementById('email').value.trim(),document.getElementById('password').value);location.href=location.pathname.includes('/pages/')?'../index.html':'index.html';}
 catch(e){error.textContent=e.message;}
 finally{boton.disabled=false;boton.textContent='Entrar al gestor →';}
});