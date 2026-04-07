import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const API    = 'https://api.doorbite.ng/api';
const SOCKET = 'https://api.doorbite.ng';
const CLOUD_NAME    = 'du34xyidb';
const UPLOAD_PRESET = 'quicky';
const GMAPS_KEY     = 'AIzaSyB8rat9sk3rTSvGiZvVl-vIbJiqt85Hcrs';

const api = axios.create({ baseURL: API });
api.interceptors.request.use(c => { const t=localStorage.getItem('r_token'); if(t) c.headers.Authorization=`Bearer ${t}`; return c; });

const C    = { primary:'#FF6B2C', dark:'#1A1A1A', white:'#fff', bg:'#F8F8F8', border:'#E8E8E8', gray:'#888', success:'#22C55E', error:'#EF4444', warning:'#F59E0B' };
const card = { background:'#fff', borderRadius:16, padding:20, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:14 };
const btn  = (bg, color='#fff') => ({ background:bg, color, border:'none', padding:'9px 18px', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13 });
const inp  = { border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 14px', fontSize:14, width:'100%', outline:'none', boxSizing:'border-box' };

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file); fd.append('upload_preset', UPLOAD_PRESET);
  const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method:'POST', body:fd });
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error(data.error?.message || 'Upload failed');
}

let tabFlashInterval = null;
const originalTitle  = document.title;
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(o => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      g.gain.setValueAtTime(0.8, ctx.currentTime+o);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+o+0.2);
      osc.start(ctx.currentTime+o); osc.stop(ctx.currentTime+o+0.25);
    });
  } catch {}
}
function flashTabTitle(code) {
  if (tabFlashInterval) clearInterval(tabFlashInterval);
  let on = true;
  tabFlashInterval = setInterval(() => { document.title = on ? `🔔 NEW ORDER #${code}!` : originalTitle; on=!on; }, 800);
  setTimeout(() => { clearInterval(tabFlashInterval); document.title=originalTitle; }, 30000);
}
function stopTabFlash() { clearInterval(tabFlashInterval); document.title=originalTitle; }
async function showBrowserNotification(order) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission==='default') await Notification.requestPermission();
    if (Notification.permission==='granted') {
      const n = new Notification('🍽️ New Order!', { body:`#${order.orderCode} — ₦${order.total?.toLocaleString()}`, icon:'/favicon.ico', tag:`order-${order._id}`, requireInteraction:true });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch {}
}
function fireNewOrderAlert(order) { playOrderSound(); flashTabTitle(order.orderCode); showBrowserNotification(order); }
if ('Notification' in window && Notification.permission==='default') {
  window.addEventListener('click', function askOnce() { Notification.requestPermission(); window.removeEventListener('click', askOnce); }, { once:true });
}

function printReceipt(order, restaurantName) {
  const win = window.open('', '_blank', 'width=420,height=650');
  if (!win) { alert('Please allow popups to print receipts'); return; }
  const itemRows = order.items?.map(i =>
    `<tr><td style="padding:5px 0;font-size:13px;">${i.name} <span style="color:#777;">x${i.quantity}</span></td><td style="padding:5px 0;font-size:13px;text-align:right;font-weight:700;">N${((i.price||0)*(i.quantity||1)).toLocaleString()}</td></tr>`
  ).join('') || '';
  const feeRows = [
    ['Subtotal', `N${(order.subtotal||0).toLocaleString()}`],
    ['Delivery fee', `N${(order.deliveryFee||1000).toLocaleString()}`],
    ['Service fee (10%)', `N${(order.serviceFee||0).toLocaleString()}`],
    ...(order.smallOrderFee > 0 ? [['Small order fee', `N${order.smallOrderFee.toLocaleString()}`]] : []),
  ].map(([l,v]) => `<tr><td style="font-size:12px;color:#666;padding:3px 0;">${l}</td><td style="font-size:12px;text-align:right;">${v}</td></tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Receipt #${order.orderCode}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Courier New',monospace;padding:24px 20px;max-width:320px;margin:0 auto;color:#111;}.center{text-align:center;}.dashed{border:none;border-top:1px dashed #aaa;margin:12px 0;}table{width:100%;border-collapse:collapse;}.total-row td{font-weight:900;font-size:16px;border-top:1px dashed #aaa;padding-top:10px;}@media print{.no-print{display:none!important;}body{padding:0;}}</style></head><body><div class="center" style="margin-bottom:14px;"><div style="font-size:28px;margin-bottom:6px;">O</div><div style="font-size:18px;font-weight:900;letter-spacing:1px;">${restaurantName||'DoorBite'}</div><div style="font-size:11px;color:#777;margin-top:3px;">Powered by DoorBite</div><div style="font-size:11px;color:#777;margin-top:2px;">${new Date().toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div><hr class="dashed"/><div style="margin-bottom:10px;"><div style="font-size:14px;font-weight:900;margin-bottom:6px;">ORDER #${order.orderCode}</div><table><tr><td style="font-size:12px;color:#666;width:80px;">Customer</td><td style="font-size:12px;font-weight:700;">${order.customer?.name||'_'}</td></tr><tr><td style="font-size:12px;color:#666;">Phone</td><td style="font-size:12px;">${order.customer?.phone||'_'}</td></tr><tr><td style="font-size:12px;color:#666;vertical-align:top;padding-top:2px;">Deliver to</td><td style="font-size:12px;line-height:1.4;">${order.deliveryAddress?.address||'_'}</td></tr></table></div><hr class="dashed"/><div style="font-size:11px;font-weight:700;color:#777;letter-spacing:0.5px;margin-bottom:6px;">ITEMS</div><table><tbody>${itemRows}</tbody></table><hr class="dashed"/><table><tbody>${feeRows}</tbody><tfoot><tr class="total-row"><td>TOTAL PAID</td><td style="text-align:right;">N${(order.total||0).toLocaleString()}</td></tr></tfoot></table><hr class="dashed"/><div class="center" style="font-size:11px;color:#777;margin-bottom:14px;">Paid via Paystack<br/>${order.paystackReference?`Ref: ${order.paystackReference}`:''}</div><div class="center" style="font-size:16px;font-weight:900;margin-bottom:4px;">Thank you!</div><div class="center" style="font-size:11px;color:#777;line-height:1.8;">Please keep this receipt for your records.<br/>Support: support@doorbite.ng</div><div class="center no-print" style="margin-top:24px;"><button onclick="window.print();" style="background:#FF6B2C;color:#fff;border:none;padding:11px 32px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-right:10px;">Print</button><button onclick="window.close();" style="background:#f5f5f5;color:#333;border:1px solid #ddd;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Close</button></div><script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
  win.document.close();
}

let gmapsLoaded=false, gmapsLoading=false, gmapsCbs=[];
function loadGoogleMaps(cb) {
  if (gmapsLoaded) { cb(); return; }
  gmapsCbs.push(cb);
  if (gmapsLoading) return;
  gmapsLoading = true;
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`;
  s.async = true; s.defer = true;
  s.onload = () => { gmapsLoaded=true; gmapsCbs.forEach(f=>f()); gmapsCbs=[]; };
  document.head.appendChild(s);
}

const NIGERIAN_BANKS = [
  {name:'Access Bank',code:'044'},{name:'Citibank Nigeria',code:'023'},{name:'Ecobank Nigeria',code:'050'},
  {name:'Fidelity Bank',code:'070'},{name:'First Bank of Nigeria',code:'011'},{name:'First City Monument Bank (FCMB)',code:'214'},
  {name:'Globus Bank',code:'00103'},{name:'Guaranty Trust Bank (GTBank)',code:'058'},{name:'Heritage Bank',code:'030'},
  {name:'Jaiz Bank',code:'301'},{name:'Keystone Bank',code:'082'},{name:'Kuda Bank',code:'50211'},
  {name:'Moniepoint MFB',code:'50515'},{name:'Opay',code:'999992'},{name:'Palmpay',code:'999991'},
  {name:'Polaris Bank',code:'076'},{name:'Providus Bank',code:'101'},{name:'Stanbic IBTC Bank',code:'221'},
  {name:'Standard Chartered Bank',code:'068'},{name:'Sterling Bank',code:'232'},{name:'Taj Bank',code:'302'},
  {name:'Titan Trust Bank',code:'102'},{name:'Union Bank of Nigeria',code:'032'},{name:'United Bank for Africa (UBA)',code:'033'},
  {name:'Unity Bank',code:'215'},{name:'Wema Bank',code:'035'},{name:'Zenith Bank',code:'057'},
];
const CUISINES = ['Nigerian','Continental','Chinese','Indian','Italian','Fast Food','Seafood','Vegetarian','Grills & BBQ','Pastries & Bakery','Pizza','Burgers'];

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const u = localStorage.getItem('r_user');
    if (u) { setUser(JSON.parse(u)); api.get('/restaurants/me').then(r => setRestaurant(r.data)).catch(() => {}); }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.user.role !== 'restaurant') throw new Error('Not a restaurant account');
    localStorage.setItem('r_token', data.token);
    localStorage.setItem('r_user', JSON.stringify(data.user));
    setUser(data.user);
    const r = await api.get('/restaurants/me');
    setRestaurant(r.data);
  };

  const forgotPassword = async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  };

  const verifyResetOtp = async (userId, otp) => {
    const { data } = await api.post('/auth/verify-reset-otp', { userId, otp });
    return data;
  };

  const resetPassword = async (userId, resetToken, newPassword) => {
    const { data } = await api.post('/auth/reset-password', { userId, resetToken, newPassword });
    localStorage.setItem('r_token', data.token);
    localStorage.setItem('r_user', JSON.stringify(data.user));
    setUser(data.user);
    const r = await api.get('/restaurants/me');
    setRestaurant(r.data);
    return data;
  };

  const logout = () => { localStorage.clear(); setUser(null); setRestaurant(null); stopTabFlash(); };

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontSize:18 }}>Loading...</div>;
  return (
    <AuthCtx.Provider value={{ user, restaurant, setRestaurant, login, logout, forgotPassword, verifyResetOtp, resetPassword }}>
      {children}
    </AuthCtx.Provider>
  );
}

function ForgotPasswordFlow({ onClose }) {
  const { forgotPassword, verifyResetOtp, resetPassword } = useAuth();
  const [step, setStep]             = useState(1);
  const [email, setEmail]           = useState('');
  const [userId, setUserId]         = useState('');
  const [otp, setOtp]               = useState(['','','','','','']);
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [countdown, setCountdown]   = useState(0);
  const inputRefs                   = Array.from({ length: 6 }, () => React.createRef());

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleOtpChange = (index, val) => {
    const cleaned = val.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp]; next[index] = cleaned; setOtp(next);
    if (cleaned && index < 5) inputRefs[index + 1]?.current?.focus();
    if (!cleaned && index > 0) inputRefs[index - 1]?.current?.focus();
    const filled = [...next]; filled[index] = cleaned;
    if (filled.every(d => d) && filled.join('').length === 6) {
      setTimeout(() => handleVerifyOtp(filled.join('')), 100);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Please enter your email address');
    setLoading(true); setError('');
    try {
      const data = await forgotPassword(email.trim().toLowerCase());
      setUserId(data.userId); setStep(2); setCountdown(60);
    } catch (err) { setError(err.response?.data?.message || err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async (code) => {
    const otpStr = code || otp.join('');
    if (otpStr.length < 6) return;
    setLoading(true); setError('');
    try {
      const data = await verifyResetOtp(userId, otpStr);
      setResetToken(data.resetToken); setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setOtp(['','','','','','']);
      inputRefs[0]?.current?.focus();
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setLoading(true); setError('');
    try {
      const data = await forgotPassword(email.trim().toLowerCase());
      setUserId(data.userId); setOtp(['','','','','','']); setCountdown(60);
    } catch (err) { setError(err.response?.data?.message || err.message); }
    finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true); setError('');
    try { await resetPassword(userId, resetToken, password); onClose(); }
    catch (err) { setError(err.response?.data?.message || err.message); }
    finally { setLoading(false); }
  };

  const icons  = ['', '🔐', '📧', '🔑'];
  const titles = ['', 'Reset Password', 'Enter Verification Code', 'Set New Password'];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:24, padding:36, width:460, maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
          <div>
            <div style={{ fontSize:36, marginBottom:6 }}>{icons[step]}</div>
            <h2 style={{ fontSize:20, fontWeight:800, margin:0 }}>{titles[step]}</h2>
            {step === 2 && <p style={{ color:C.gray, fontSize:13, margin:'4px 0 0' }}>Code sent to <strong>{email}</strong></p>}
            {step === 3 && <p style={{ color:C.gray, fontSize:13, margin:'4px 0 0' }}>Choose a strong new password</p>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:C.gray }}>x</button>
        </div>
        {error && <div style={{ background:'#FEE2E2', color:C.error, padding:12, borderRadius:10, marginBottom:16, fontSize:13 }}>{error}</div>}
        {step === 1 && (
          <form onSubmit={handleSendOtp}>
            <label style={{ fontSize:13, fontWeight:600, display:'block', marginBottom:6 }}>Email Address</label>
            <input style={{ ...inp, marginBottom:20 }} type="email" placeholder="you@restaurant.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            <button type="submit" style={{ ...btn(C.primary), width:'100%', padding:'13px 0', fontSize:15 }} disabled={loading}>{loading ? 'Sending...' : 'Send Reset Code'}</button>
          </form>
        )}
        {step === 2 && (
          <div>
            <p style={{ color:C.gray, fontSize:13, textAlign:'center', marginBottom:16 }}>Enter the 6-digit code from your email</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:20 }}>
              {otp.map((digit, i) => (
                <input key={i} ref={inputRefs[i]}
                  style={{ width:46, height:54, borderRadius:10, border:`2px solid ${digit ? C.primary : C.border}`, fontSize:22, fontWeight:800, textAlign:'center', outline:'none', background:digit ? '#FFF7ED' : '#fafafa' }}
                  value={digit} maxLength={1} inputMode="numeric"
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Backspace' && !digit && i > 0) inputRefs[i - 1]?.current?.focus(); }}
                />
              ))}
            </div>
            <button onClick={() => handleVerifyOtp()} style={{ ...btn(otp.every(d => d) ? C.primary : '#ccc'), width:'100%', padding:'13px 0', fontSize:15, marginBottom:14 }} disabled={!otp.every(d => d) || loading}>
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            <div style={{ textAlign:'center', fontSize:13 }}>
              {countdown > 0
                ? <span style={{ color:C.gray }}>Resend in <strong style={{ color:C.primary }}>{countdown}s</strong></span>
                : <button onClick={handleResend} disabled={loading} style={{ background:'none', border:'none', color:C.primary, fontWeight:700, cursor:'pointer', fontSize:13 }}>Resend code</button>
              }
            </div>
          </div>
        )}
        {step === 3 && (
          <form onSubmit={handleReset}>
            <label style={{ fontSize:13, fontWeight:600, display:'block', marginBottom:6 }}>New Password</label>
            <input style={{ ...inp, marginBottom:14 }} type="password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
            <label style={{ fontSize:13, fontWeight:600, display:'block', marginBottom:6 }}>Confirm Password</label>
            <input style={{ ...inp, marginBottom:20 }} type="password" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            <button type="submit" style={{ ...btn(C.primary), width:'100%', padding:'13px 0', fontSize:15 }} disabled={loading}>{loading ? 'Saving...' : 'Set New Password'}</button>
          </form>
        )}
        <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:20 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ width:s === step ? 20 : 8, height:8, borderRadius:4, background:s <= step ? C.primary : '#E5E7EB', transition:'all 0.2s' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LocationPicker({ value, onChange, label = 'Restaurant Location' }) {
  const [gmapsReady, setGmapsReady]   = useState(false);
  const [searching, setSearching]     = useState(false);
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [manualLat, setManualLat]     = useState('');
  const [manualLng, setManualLng]     = useState('');
  const [showManual, setShowManual]   = useState(false);
  const mapRef=useRef(null); const mapObjRef=useRef(null); const markerRef=useRef(null);
  const svcRef=useRef(null); const tokenRef=useRef(null); const debounceRef=useRef(null);

  useEffect(() => { loadGoogleMaps(() => setGmapsReady(true)); }, []);
  useEffect(() => {
    if (!gmapsReady || !mapRef.current) return;
    const center = value?.lat ? { lat:value.lat, lng:value.lng } : { lat:6.3350, lng:5.6037 };
    const map = new window.google.maps.Map(mapRef.current, { center, zoom:value?.lat?17:13, mapTypeControl:false, streetViewControl:false, fullscreenControl:false });
    mapObjRef.current = map;
    if (value?.lat) { markerRef.current = new window.google.maps.Marker({ position:center, map, draggable:true, animation:window.google.maps.Animation.DROP }); attachMarkerDrag(markerRef.current); }
    map.addListener('click', (e) => { placeMarker(map,{lat:e.latLng.lat(),lng:e.latLng.lng()}); reverseGeocode(e.latLng.lat(),e.latLng.lng()); });
    svcRef.current = new window.google.maps.places.AutocompleteService();
    tokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, [gmapsReady]);
  useEffect(() => {
    if (!mapObjRef.current || !value?.lat) return;
    mapObjRef.current.panTo({lat:value.lat,lng:value.lng}); mapObjRef.current.setZoom(17); placeMarker(mapObjRef.current,{lat:value.lat,lng:value.lng});
  }, [value?.lat, value?.lng]);

  const placeMarker = (map, pos) => { if(markerRef.current){markerRef.current.setPosition(pos);}else{markerRef.current=new window.google.maps.Marker({position:pos,map,draggable:true,animation:window.google.maps.Animation.DROP});attachMarkerDrag(markerRef.current);} };
  const attachMarkerDrag = (marker) => { marker.addListener('dragend',(e)=>reverseGeocode(e.latLng.lat(),e.latLng.lng())); };
  const reverseGeocode = (lat, lng) => { new window.google.maps.Geocoder().geocode({location:{lat,lng}},(results,status)=>{ const addr=status==='OK'&&results[0]?results[0].formatted_address:`${lat.toFixed(5)}, ${lng.toFixed(5)}`; setQuery(addr); onChange({lat,lng,address:addr}); }); };
  const handleSearch = (e) => { const q=e.target.value; setQuery(q); clearTimeout(debounceRef.current); if(!q||q.length<2){setSuggestions([]);return;} debounceRef.current=setTimeout(()=>{ if(!svcRef.current)return; setSearching(true); svcRef.current.getPlacePredictions({input:q,componentRestrictions:{country:'ng'},sessionToken:tokenRef.current,location:new window.google.maps.LatLng(6.3350,5.6037),radius:60000},(preds,status)=>{setSearching(false);setSuggestions(status==='OK'&&preds?preds:[]);}); },350); };
  const pickSuggestion = (pred) => { setSuggestions([]); setSearching(true); new window.google.maps.Geocoder().geocode({placeId:pred.place_id},(results,status)=>{ setSearching(false); if(status==='OK'&&results[0]){const loc=results[0].geometry.location;const lat=loc.lat();const lng=loc.lng();const addr=results[0].formatted_address;setQuery(addr);tokenRef.current=new window.google.maps.places.AutocompleteSessionToken();if(mapObjRef.current){mapObjRef.current.panTo({lat,lng});mapObjRef.current.setZoom(17);placeMarker(mapObjRef.current,{lat,lng});}onChange({lat,lng,address:addr});} }); };
  const applyManual = () => { const lat=parseFloat(manualLat);const lng=parseFloat(manualLng);if(isNaN(lat)||isNaN(lng))return alert('Please enter valid numbers');if(lat<4||lat>14||lng<2||lng>15)return alert('Coordinates look wrong for Nigeria.');if(mapObjRef.current){mapObjRef.current.panTo({lat,lng});mapObjRef.current.setZoom(17);placeMarker(mapObjRef.current,{lat,lng});}reverseGeocode(lat,lng);setShowManual(false); };
  const clear = () => { setQuery('');setSuggestions([]);setManualLat('');setManualLng('');if(markerRef.current){markerRef.current.setMap(null);markerRef.current=null;}if(mapObjRef.current)mapObjRef.current.setZoom(13);onChange(null); };

  return (
    <div>
      <label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:8}}>{label}</label>
      <div style={{position:'relative',marginBottom:8}}>
        <div style={{display:'flex',gap:8}}>
          <div style={{position:'relative',flex:1}}>
            <input style={{...inp,paddingRight:36,borderColor:value?.lat?C.success:C.border}} placeholder={gmapsReady?'Search address or click on map below...':'Loading map...'} value={query} onChange={handleSearch} disabled={!gmapsReady} />
            {searching&&<div style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:12,color:C.gray}}>...</div>}
            {value?.lat&&!searching&&<button onClick={clear} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.gray,fontSize:17}}>x</button>}
          </div>
          <button onClick={()=>setShowManual(!showManual)} style={{...btn(showManual?C.warning:'#f5f5f5'),color:showManual?'#fff':C.gray,flexShrink:0,fontSize:12,padding:'9px 14px',whiteSpace:'nowrap'}}>Lat/Lng</button>
        </div>
        {suggestions.length>0&&(
          <div style={{position:'absolute',top:'100%',left:0,right:48,background:'#fff',border:`1px solid ${C.border}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:400,maxHeight:220,overflowY:'auto',marginTop:4}}>
            {suggestions.map((p,i)=>(
              <div key={p.place_id} onClick={()=>pickSuggestion(p)} style={{padding:'11px 14px',cursor:'pointer',borderBottom:i<suggestions.length-1?`1px solid ${C.border}`:'none',fontSize:13,lineHeight:1.4}} onMouseEnter={e=>e.currentTarget.style.background='#FFF7ED'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <strong>{p.structured_formatting?.main_text}</strong>{p.structured_formatting?.secondary_text&&<span style={{color:C.gray}}> · {p.structured_formatting.secondary_text}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {showManual&&(
        <div style={{background:'#FFF7ED',borderRadius:10,padding:14,marginBottom:8,border:'1px solid #FED7AA'}}>
          <div style={{fontSize:12,color:'#92400E',fontWeight:700,marginBottom:10}}>Enter coordinates manually — from Google Maps: right-click then copy numbers</div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
            <div style={{flex:1}}><label style={{fontSize:11,fontWeight:700,color:'#92400E',display:'block',marginBottom:4}}>LATITUDE</label><input style={{...inp,fontSize:13}} placeholder="e.g. 6.33450" value={manualLat} onChange={e=>setManualLat(e.target.value)} /></div>
            <div style={{flex:1}}><label style={{fontSize:11,fontWeight:700,color:'#92400E',display:'block',marginBottom:4}}>LONGITUDE</label><input style={{...inp,fontSize:13}} placeholder="e.g. 5.62710" value={manualLng} onChange={e=>setManualLng(e.target.value)} /></div>
            <button onClick={applyManual} style={{...btn(manualLat&&manualLng?C.primary:'#ccc'),padding:'10px 16px',flexShrink:0}} disabled={!manualLat||!manualLng}>Go</button>
          </div>
        </div>
      )}
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:`2px solid ${value?.lat?C.success:C.border}`}}>
        <div ref={mapRef} style={{width:'100%',height:300}} />
        {!gmapsReady&&<div style={{position:'absolute',inset:0,background:'#f5f5f5',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10}}><div style={{fontSize:32}}>Map</div><div style={{color:C.gray,fontSize:13,fontWeight:600}}>Loading Google Maps...</div></div>}
        {gmapsReady&&!value?.lat&&<div style={{position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.65)',color:'#fff',fontSize:12,fontWeight:600,padding:'7px 14px',borderRadius:20,pointerEvents:'none',whiteSpace:'nowrap'}}>Click anywhere on the map to pin your location</div>}
        {value?.lat&&<div style={{position:'absolute',top:10,left:10,background:'rgba(34,197,94,0.92)',color:'#fff',fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:20}}>Location pinned — drag marker to adjust</div>}
      </div>
      {value?.lat&&(
        <div style={{marginTop:8,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#F0FDF4',borderRadius:10,padding:'10px 14px',border:'1px solid #BBF7D0'}}>
          <div><div style={{fontSize:12,fontWeight:700,color:C.success}}>{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</div>{value.address&&<div style={{fontSize:11,color:C.gray,marginTop:2}}>{value.address.length>60?value.address.slice(0,60)+'...':value.address}</div>}</div>
          <a href={`https://www.google.com/maps?q=${value.lat},${value.lng}`} target="_blank" rel="noreferrer" style={{...btn(C.primary),fontSize:11,padding:'5px 12px',textDecoration:'none',display:'inline-block',flexShrink:0}}>Open in Maps</a>
        </div>
      )}
      {!value?.lat&&<div style={{fontSize:11,color:C.gray,marginTop:6}}>Search above, click on the map, or use the Lat/Lng button to enter coordinates directly</div>}
    </div>
  );
}

function Register({ onBack }) {
  const [form,setForm]=useState({ownerName:'',email:'',password:'',phone:'',restaurantName:'',cuisineType:'',address:'',description:''});
  const [location,setLocation]=useState(null);
  const [loading,setLoading]=useState(false);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState('');
  const handle=async e=>{ e.preventDefault(); if(!form.ownerName||!form.email||!form.password||!form.phone||!form.restaurantName||!form.cuisineType||!form.address) return setError('Please fill in all required fields'); setLoading(true);setError(''); try{await axios.post(`${API}/auth/register-restaurant`,{...form,location:location?{lat:location.lat,lng:location.lng}:undefined});setSuccess(true);}catch(err){setError(err.response?.data?.message||err.message);}finally{setLoading(false);} };
  if(success) return (
    <div style={{display:'flex',height:'100vh',alignItems:'center',justifyContent:'center',background:C.bg}}>
      <div style={{background:'#fff',borderRadius:24,padding:48,maxWidth:480,textAlign:'center',boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>
        <div style={{fontSize:64,marginBottom:16}}>🎉</div>
        <h2 style={{fontSize:26,fontWeight:800,marginBottom:8}}>Application Submitted!</h2>
        <p style={{color:C.gray,fontSize:15,lineHeight:1.6,marginBottom:8}}>Our team will review and activate your account within <strong>24 hours</strong>.</p>
        <div style={{background:'#F0FDF4',borderRadius:12,padding:16,marginBottom:28,border:'1px solid #BBF7D0'}}>
          <p style={{color:'#15803D',fontWeight:600,fontSize:13,margin:0}}>Restaurant: {form.restaurantName}<br/>Cuisine: {form.cuisineType}<br/>Address: {form.address}<br/>{location&&`Location pinned: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}</p>
        </div>
        <button onClick={onBack} style={{...btn(C.primary),padding:'12px 32px',fontSize:15}}>Back to Login</button>
      </div>
    </div>
  );
  return (
    <div style={{display:'flex',minHeight:'100vh',background:C.bg}}>
      <div style={{width:300,background:C.primary,padding:40,display:'flex',flexDirection:'column',justifyContent:'center',position:'sticky',top:0,height:'100vh',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:32}}><div style={{width:48,height:48,borderRadius:12,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>O</div><div><div style={{color:'#fff',fontWeight:800,fontSize:20}}>DoorBite</div><div style={{color:'rgba(255,255,255,0.7)',fontSize:12}}>Restaurant Partner</div></div></div>
        <h2 style={{color:'#fff',fontWeight:800,fontSize:20,marginBottom:8}}>Grow your restaurant with us</h2>
        <p style={{color:'rgba(255,255,255,0.8)',fontSize:13,lineHeight:1.6,marginBottom:24}}>Join restaurants delivering to customers across Edo State.</p>
        {[['📦','Get orders 24/7'],['💰','Get paid after every delivery'],['📊','Track earnings in real time'],['🛵','We handle the delivery'],['⭐','Build your restaurant rating']].map(([i,t])=>(<div key={t} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}><span style={{fontSize:18}}>{i}</span><span style={{color:'rgba(255,255,255,0.9)',fontSize:13}}>{t}</span></div>))}
        <button onClick={onBack} style={{...btn('rgba(255,255,255,0.15)'),marginTop:32,border:'1px solid rgba(255,255,255,0.3)',padding:'10px 20px'}}>Already have an account</button>
      </div>
      <div style={{flex:1,overflowY:'auto',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:40}}>
        <form onSubmit={handle} style={{background:'#fff',borderRadius:24,padding:36,width:'100%',maxWidth:580,boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>
          <h2 style={{fontSize:26,fontWeight:800,marginBottom:4}}>Apply to Partner</h2>
          <p style={{color:C.gray,marginBottom:28,fontSize:14}}>Fill in the details below and we'll review your application within 24 hours.</p>
          {error&&<div style={{background:'#FEE2E2',color:C.error,padding:12,borderRadius:10,marginBottom:20,fontSize:13}}>{error}</div>}
          <div style={{background:C.bg,borderRadius:12,padding:16,marginBottom:20}}>
            <h3 style={{fontWeight:800,fontSize:15,marginBottom:14}}>Owner Information</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {[['Full Name *','text','ownerName','Your full name'],['Phone Number *','tel','phone','08012345678'],['Email Address *','email','email','you@restaurant.com'],['Password *','password','password','Create a password']].map(([l,type,k,ph])=>(
                <div key={k}><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>{l}</label><input style={inp} type={type} placeholder={ph} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} /></div>
              ))}
            </div>
          </div>
          <div style={{background:C.bg,borderRadius:12,padding:16,marginBottom:20}}>
            <h3 style={{fontWeight:800,fontSize:15,marginBottom:14}}>Restaurant Information</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Restaurant Name *</label><input style={inp} placeholder="e.g. Mama's Kitchen" value={form.restaurantName} onChange={e=>setForm({...form,restaurantName:e.target.value})} /></div>
              <div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Cuisine Type *</label><select style={{...inp,height:44,cursor:'pointer',background:'#fff'}} value={form.cuisineType} onChange={e=>setForm({...form,cuisineType:e.target.value})}><option value="">Select cuisine type...</option>{CUISINES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div style={{marginBottom:14}}><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Street Address *</label><input style={inp} placeholder="e.g. 12 Sapele Road, GRA, Benin City" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} /></div>
            <textarea style={{...inp,height:80,resize:'vertical'}} placeholder="Tell customers what makes your restaurant special... (optional)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
          </div>
          <div style={{background:'#FFF7ED',borderRadius:12,padding:16,marginBottom:20,border:'1px solid #FED7AA'}}>
            <h3 style={{fontWeight:800,fontSize:15,marginBottom:4}}>Pin Your Location on the Map</h3>
            <p style={{color:'#92400E',fontSize:13,marginBottom:14}}>This helps riders navigate to your restaurant accurately.</p>
            <LocationPicker value={location} onChange={setLocation} label="Search your restaurant address" />
            {!location&&<div style={{background:'#FEF3C7',borderRadius:8,padding:10,marginTop:12,border:'1px solid #FDE68A'}}><div style={{fontSize:12,color:'#92400E',fontWeight:600}}>Location not set yet</div><div style={{fontSize:11,color:'#B45309',marginTop:2}}>You can also set this later from your Settings dashboard.</div></div>}
          </div>
          <div style={{background:'#FFF7ED',borderRadius:12,padding:14,marginBottom:20,border:'1px solid #FED7AA'}}><p style={{color:'#92400E',fontSize:13,margin:0}}>By submitting, you agree to DoorBite's partner terms. We charge a <strong>10% platform fee</strong> on all orders.</p></div>
          <button type="submit" style={{...btn(C.primary),width:'100%',padding:16,fontSize:16}} disabled={loading}>{loading?'Submitting application...':'Submit Application'}</button>
        </form>
      </div>
    </div>
  );
}

function Login({ onRegister }) {
  const { login }                  = useAuth();
  const [email,setEmail]           = useState('');
  const [password,setPassword]     = useState('');
  const [error,setError]           = useState('');
  const [loading,setLoading]       = useState(false);
  const [showForgot,setShowForgot] = useState(false);
  const handle=async e=>{ e.preventDefault();setLoading(true);setError('');try{await login(email,password);}catch(err){setError(err.response?.data?.message||err.message);}finally{setLoading(false);} };
  return (
    <div style={{display:'flex',height:'100vh'}}>
      <div style={{width:300,background:C.primary,padding:40,display:'flex',flexDirection:'column',justifyContent:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:40}}><div style={{width:48,height:48,borderRadius:12,background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>O</div><div><div style={{color:'#fff',fontWeight:800,fontSize:20}}>DoorBite</div><div style={{color:'rgba(255,255,255,0.7)',fontSize:12}}>Restaurant Dashboard</div></div></div>
        {['Real-time order queue','Full menu management','Revenue & analytics','Withdrawal via Paystack'].map(f=>(<div key={f} style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}><span style={{color:'#fff',fontWeight:800}}>✓</span><span style={{color:'rgba(255,255,255,0.9)',fontSize:15}}>{f}</span></div>))}
        <div style={{marginTop:'auto',paddingTop:32,borderTop:'1px solid rgba(255,255,255,0.2)'}}><p style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:12}}>Want to list your restaurant on DoorBite?</p><button onClick={onRegister} style={{...btn('rgba(255,255,255,0.2)'),width:'100%',padding:12,fontSize:14,border:'1px solid rgba(255,255,255,0.3)'}}>Partner with us</button></div>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}>
        <form onSubmit={handle} style={{background:'#fff',borderRadius:24,padding:36,width:420,boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>
          <h2 style={{fontSize:26,fontWeight:800,marginBottom:4}}>Welcome back</h2>
          <p style={{color:C.gray,marginBottom:24,fontSize:14}}>Sign in to your restaurant account</p>
          {error&&<div style={{background:'#FEE2E2',color:C.error,padding:12,borderRadius:10,marginBottom:14,fontSize:13}}>{error}</div>}
          <label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Email</label>
          <input style={{...inp,marginBottom:16}} placeholder="you@restaurant.com" value={email} onChange={e=>setEmail(e.target.value)} />
          <label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Password</label>
          <input style={{...inp,marginBottom:8}} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} />
          <div style={{textAlign:'right',marginBottom:20}}>
            <button type="button" onClick={()=>setShowForgot(true)} style={{background:'none',border:'none',color:C.primary,fontWeight:600,fontSize:13,cursor:'pointer'}}>Forgot password?</button>
          </div>
          <button type="submit" style={{...btn(C.primary),width:'100%',padding:14,fontSize:16}} disabled={loading}>{loading?'Signing in...':'Sign In'}</button>
          <p style={{textAlign:'center',marginTop:16,fontSize:13,color:C.gray}}>New restaurant? <span onClick={onRegister} style={{color:C.primary,fontWeight:700,cursor:'pointer'}}>Apply to join</span></p>
        </form>
      </div>
      {showForgot && <ForgotPasswordFlow onClose={()=>setShowForgot(false)} />}
    </div>
  );
}

function Sidebar({page,setPage,pendingCount}) {
  const {restaurant,setRestaurant,logout}=useAuth();
  const [toggling,setToggling]=useState(false);
  const nav=[{k:'overview',l:'Overview',i:'📊'},{k:'orders',l:'Orders',i:'📦',badge:pendingCount},{k:'menu',l:'Menu',i:'🍽️'},{k:'analytics',l:'Analytics',i:'📈'},{k:'wallet',l:'Wallet',i:'💰'},{k:'settings',l:'Settings',i:'⚙️'}];

  const toggleOpen = async () => {
    setToggling(true);
    try {
      const {data} = await api.patch('/restaurants/me', { isOpen: !restaurant.isOpen });
      setRestaurant(data);
    } catch { alert('Failed to update status'); }
    finally { setToggling(false); }
  };

  return (
    <div style={{width:220,background:C.dark,height:'100vh',display:'flex',flexDirection:'column',padding:'24px 16px',position:'sticky',top:0}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}><div style={{width:40,height:40,borderRadius:10,background:C.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🍽️</div><div><div style={{color:'#fff',fontWeight:800,fontSize:15}}>DoorBite</div><div style={{color:'#666',fontSize:10,letterSpacing:1}}>RESTAURANT</div></div></div>
      <div style={{background:'#2A2A2A',borderRadius:12,padding:12,marginBottom:20}}>
        {restaurant?.logo&&<img src={restaurant.logo} alt="" style={{width:40,height:40,borderRadius:8,objectFit:'cover',marginBottom:8,display:'block'}} />}
        <div style={{color:'#fff',fontWeight:700,fontSize:14,marginBottom:10}}>{restaurant?.name||'My Restaurant'}</div>
        {/* ── OPEN / CLOSED TOGGLE ── */}
        <button onClick={toggleOpen} disabled={toggling} style={{width:'100%',background:restaurant?.isOpen?'#22C55E22':'#EF444422',border:`1px solid ${restaurant?.isOpen?C.success:C.error}`,borderRadius:8,padding:'8px 10px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',transition:'all 0.2s'}}>
          <span style={{color:restaurant?.isOpen?C.success:C.error,fontWeight:700,fontSize:13}}>
            {toggling?'...' : restaurant?.isOpen?'● Open':'● Closed'}
          </span>
          {/* Toggle pill */}
          <div style={{width:36,height:20,borderRadius:10,background:restaurant?.isOpen?C.success:'#555',position:'relative',transition:'all 0.2s',flexShrink:0}}>
            <div style={{width:14,height:14,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:restaurant?.isOpen?18:3,transition:'left 0.2s'}} />
          </div>
        </button>
      </div>
      <div style={{flex:1}}>{nav.map(n=>(<div key={n.k} onClick={()=>{ setPage(n.k); if(n.k==='orders') stopTabFlash(); }} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,cursor:'pointer',marginBottom:2,background:page===n.k?C.primary:'transparent',color:page===n.k?'#fff':'#888',fontWeight:600,fontSize:14}}><span>{n.i}</span><span style={{flex:1}}>{n.l}</span>{n.badge>0&&<span style={{background:C.error,color:'#fff',borderRadius:10,padding:'2px 7px',fontSize:11,fontWeight:800}}>{n.badge}</span>}</div>))}</div>
      <div onClick={logout} style={{color:'#666',cursor:'pointer',padding:'10px 12px',fontWeight:600}}>↩ Sign out</div>
    </div>
  );
}

function Overview({setPage}) {
  const {restaurant}=useAuth();
  const [analytics,setAnalytics]=useState(null);
  const [liveOrders,setLiveOrders]=useState([]);
  const socketRef=useRef(null);
  useEffect(()=>{
    api.get('/restaurants/analytics').then(r=>setAnalytics(r.data)).catch(()=>{});
    api.get('/orders/restaurant').then(r=>setLiveOrders(r.data.filter(o=>['pending','confirmed','preparing'].includes(o.status)).slice(0,5))).catch(()=>{});
    if(!restaurant) return;
    const socket=io(SOCKET); socketRef.current=socket;
    socket.emit('restaurant:join',restaurant._id);
    socket.on('order:new', order=>{ setLiveOrders(prev=>[order,...prev.slice(0,4)]); fireNewOrderAlert(order); });
    socket.on('order:status',({orderId,status})=>setLiveOrders(prev=>prev.map(o=>o._id===orderId?{...o,status}:o).filter(o=>!['delivered','rejected','cancelled'].includes(o.status))));
    return()=>socket.disconnect();
  },[restaurant]);
  const confirmOrder=async(orderId,prepTime)=>{ await api.patch(`/orders/${orderId}/status`,{status:'confirmed',prepTime}); setLiveOrders(prev=>prev.map(o=>o._id===orderId?{...o,status:'confirmed',prepTime}:o)); stopTabFlash(); };
  const rejectOrder=async(orderId)=>{ await api.patch(`/orders/${orderId}/status`,{status:'rejected'}); setLiveOrders(prev=>prev.filter(o=>o._id!==orderId)); stopTabFlash(); };
  const markReady=async(orderId)=>{ await api.patch(`/orders/${orderId}/status`,{status:'ready_for_pickup'}); setLiveOrders(prev=>prev.filter(o=>o._id!==orderId)); };
  const now=new Date();
  const greeting=now.getHours()<12?'Good morning':now.getHours()<17?'Good afternoon':'Good evening';
  const pending=liveOrders.filter(o=>o.status==='pending').length;
  return (
    <div style={{padding:28,overflowY:'auto',flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div><h1 style={{fontSize:26,fontWeight:800}}>{greeting}, {restaurant?.name?.split(' ')[0]} 👋</h1><p style={{color:C.gray}}>{now.toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long'})}</p></div>
        {pending>0&&<div onClick={()=>{ setPage('orders'); stopTabFlash(); }} style={{background:'#FEF3C7',border:'1px solid #F59E0B',padding:'8px 16px',borderRadius:20,cursor:'pointer',fontWeight:700,fontSize:13,color:'#92400E'}}>🔔 {pending} new order{pending>1?'s':''} need attention</div>}
      </div>
      {!restaurant?.location?.lat&&(<div onClick={()=>setPage('settings')} style={{background:'#FFF7ED',border:`1px solid ${C.warning}`,borderRadius:14,padding:14,marginBottom:20,cursor:'pointer',display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:24}}>📍</span><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:'#92400E'}}>Your restaurant location is not set</div><div style={{fontSize:13,color:'#B45309',marginTop:2}}>Riders won't know where to pick up orders. Click to set your location in Settings.</div></div><span style={{color:C.primary,fontWeight:700,fontSize:13}}>Set Now</span></div>)}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:14,marginBottom:14}}>
        <div style={{...card,background:C.primary,marginBottom:0}}><div style={{color:'rgba(255,255,255,0.7)',fontSize:11,fontWeight:700,letterSpacing:0.5}}>TODAY'S REVENUE</div><div style={{color:'#fff',fontSize:28,fontWeight:800,margin:'4px 0'}}>N{(analytics?.todayRevenue||0).toLocaleString()}</div><div style={{color:'rgba(255,255,255,0.6)',fontSize:12}}>{analytics?.todayOrders||0} orders</div></div>
        {[['PENDING',pending,'Need confirmation'],['IN KITCHEN',liveOrders.filter(o=>o.status==='preparing').length,'Being prepared'],['WALLET','N'+(analytics?.walletBalance||0).toLocaleString(),'Available balance']].map(([l,v,s])=>(<div key={l} style={{...card,marginBottom:0}}><div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:0.5}}>{l}</div><div style={{fontSize:22,fontWeight:800,margin:'4px 0'}}>{v}</div><div style={{color:C.gray,fontSize:12}}>{s}</div></div>))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><h2 style={{fontSize:18,fontWeight:800}}>Live Orders</h2><span onClick={()=>setPage('orders')} style={{color:C.primary,fontWeight:700,cursor:'pointer'}}>View all</span></div>
      {liveOrders.length===0?(<div style={card}><p style={{color:C.gray,textAlign:'center',padding:20}}>No active orders right now</p></div>):liveOrders.map(order=>(
        <div key={order._id} style={{...card,borderLeft:`4px solid ${C.primary}`}}>
          <div style={{display:'inline-block',background:'#FFF7ED',color:C.primary,padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700,marginBottom:10}}>{order.status==='pending'?'New Order':order.status}</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div><div style={{color:C.gray,fontSize:12}}>#{order.orderCode} · {new Date(order.createdAt).toLocaleTimeString()}</div><div style={{fontWeight:700,fontSize:16}}>{order.customer?.name}</div><div style={{color:C.gray,fontSize:13}}>{order.items?.map(i=>`${i.name} x${i.quantity}`).join(' · ')}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:20,fontWeight:800}}>N{order.total?.toLocaleString()}</div><div style={{fontSize:12,color:C.success,fontWeight:600}}>You get: N{Math.round((order.subtotal||0)*0.90).toLocaleString()}</div></div>
          </div>
          {order.status==='pending'&&(<div><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}><span style={{color:C.gray,fontSize:13,fontWeight:600}}>Prep time:</span>{[10,15,20,30,45].map(t=><button key={t} onClick={()=>confirmOrder(order._id,t)} style={{...btn('#f5f5f5',C.dark),borderRadius:20,padding:'5px 12px'}}>{t}m</button>)}</div><div style={{display:'flex',gap:8}}><button onClick={()=>rejectOrder(order._id)} style={{...btn('#fff'),flex:1,color:C.error,border:`1px solid ${C.error}`}}>Reject</button><button onClick={()=>confirmOrder(order._id,20)} style={{...btn(C.primary),flex:2}}>Confirm (20 min)</button></div></div>)}
          {order.status==='confirmed'&&<button onClick={()=>api.patch(`/orders/${order._id}/status`,{status:'preparing'}).then(()=>setLiveOrders(prev=>prev.map(o=>o._id===order._id?{...o,status:'preparing'}:o)))} style={btn(C.warning)}>Start Preparing</button>}
          {order.status==='preparing'&&<button onClick={()=>markReady(order._id)} style={btn(C.success)}>Mark Ready for Pickup</button>}
          {order.status!=='pending'&&<button onClick={()=>printReceipt(order,restaurant?.name)} style={{...btn('#fff'),color:C.gray,border:`1px solid ${C.border}`,marginTop:10,width:'100%',fontSize:12}}>Print Receipt</button>}
        </div>
      ))}
    </div>
  );
}

function Orders() {
  const {restaurant}=useAuth();
  const [orders,setOrders]=useState([]); const [tab,setTab]=useState('pending'); const socketRef=useRef(null);
  const TABS={pending:['pending'],preparing:['confirmed','preparing'],'en route':['ready_for_pickup','accepted','picked_up'],done:['delivered','rejected','cancelled']};
  useEffect(()=>{
    api.get('/orders/restaurant').then(r=>setOrders(r.data)).catch(()=>{});
    if(!restaurant) return;
    const socket=io(SOCKET); socketRef.current=socket;
    socket.emit('restaurant:join',restaurant._id);
    socket.on('order:new', o=>{ setOrders(prev=>[o,...prev]); fireNewOrderAlert(o); });
    socket.on('order:status',({orderId,status})=>setOrders(prev=>prev.map(o=>o._id===orderId?{...o,status}:o)));
    return()=>socket.disconnect();
  },[restaurant]);
  const update=async(id,status,extra={})=>{ await api.patch(`/orders/${id}/status`,{status,...extra}); setOrders(prev=>prev.map(o=>o._id===id?{...o,status,...extra}:o)); stopTabFlash(); };
  const filtered=orders.filter(o=>TABS[tab]?.includes(o.status));
  const SC={pending:C.warning,confirmed:'#3B82F6',preparing:'#8B5CF6',ready_for_pickup:'#06B6D4',delivered:C.success,rejected:C.error,cancelled:C.gray};
  return (
    <div style={{padding:28,overflowY:'auto',flex:1}}>
      <h1 style={{fontSize:26,fontWeight:800,marginBottom:20}}>Orders</h1>
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>{Object.keys(TABS).map(t=>{ const count=t==='pending'?orders.filter(o=>o.status==='pending').length:0; return <button key={t} onClick={()=>setTab(t)} style={{...btn(tab===t?C.primary:'#fff'),color:tab===t?'#fff':C.gray,border:`1px solid ${C.border}`,borderRadius:20,textTransform:'capitalize'}}>{t}{count>0?` (${count})`:''}</button>; })}</div>
      {filtered.length===0?<p style={{color:C.gray,textAlign:'center',marginTop:60}}>No {tab} orders</p>:filtered.map(order=>(
        <div key={order._id} style={{...card,borderLeft:order.status==='pending'?`4px solid ${C.primary}`:'none'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div><span style={{color:C.gray,fontSize:12}}>#{order.orderCode} · {order.customer?.name} · {order.customer?.phone}</span><div style={{fontWeight:700,fontSize:15,marginTop:2}}>{order.items?.map(i=>`${i.name} x${i.quantity}`).join(', ')}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:20,fontWeight:800}}>N{order.total?.toLocaleString()}</div><div style={{fontSize:12,color:C.success,fontWeight:600}}>Your cut: N{Math.round((order.subtotal||0)*0.90).toLocaleString()}</div><span style={{background:(SC[order.status]||'#ccc')+'22',color:SC[order.status]||'#ccc',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}}>{order.status}</span></div>
          </div>
          {order.deliveryAddress?.address&&<div style={{fontSize:12,color:C.gray,marginBottom:8}}>📍 {order.deliveryAddress.address}</div>}
          {order.status==='pending'&&(<div style={{display:'flex',gap:8,marginTop:10}}><button style={{...btn('#fff'),flex:1,color:C.error,border:`1px solid ${C.error}`}} onClick={()=>update(order._id,'rejected')}>Reject</button><button style={{...btn(C.primary),flex:2}} onClick={()=>update(order._id,'confirmed',{prepTime:20})}>Confirm</button></div>)}
          {order.status==='confirmed'&&<button style={{...btn(C.warning),marginTop:10}} onClick={()=>update(order._id,'preparing')}>Start Preparing</button>}
          {order.status==='preparing'&&<button style={{...btn(C.success),marginTop:10}} onClick={()=>update(order._id,'ready_for_pickup')}>Mark Ready for Pickup</button>}
          {!['pending','rejected','cancelled'].includes(order.status)&&(
            <button onClick={()=>printReceipt(order,restaurant?.name)} style={{...btn('#fff'),color:'#555',border:`1px solid ${C.border}`,marginTop:10,width:'100%',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>Print Receipt for Customer</button>
          )}
        </div>
      ))}
    </div>
  );
}

function Menu() {
  const {restaurant}=useAuth();
  const [items,setItems]=useState([]); const [cat,setCat]=useState('All'); const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({name:'',price:'',category:'Mains',description:'',image:''}); const [uploading,setUploading]=useState(false);
  const fetch_=()=>{ if(restaurant) api.get(`/menu/${restaurant._id}`).then(r=>setItems(r.data)).catch(()=>{}); };
  useEffect(()=>{ fetch_(); },[restaurant]);
  const handleImageUpload=async e=>{ const file=e.target.files[0]; if(!file) return; setUploading(true); try{ const url=await uploadToCloudinary(file); setForm(f=>({...f,image:url})); }catch(err){ alert('Image upload failed: '+err.message); }finally{ setUploading(false); } };
  const add=async()=>{ if(!form.name||!form.price) return; await api.post('/menu',{...form,price:Number(form.price)}); setForm({name:'',price:'',category:'Mains',description:'',image:''}); setShowForm(false); fetch_(); };
  const toggle=async item=>{ await api.patch(`/menu/${item._id}`,{isAvailable:!item.isAvailable}); fetch_(); };
  const del=async id=>{ if(window.confirm('Delete this item?')){ await api.delete(`/menu/${id}`); fetch_(); } };
  const filtered=cat==='All'?items:items.filter(i=>i.category===cat);
  return (
    <div style={{padding:28,overflowY:'auto',flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}><div><h1 style={{fontSize:26,fontWeight:800}}>Menu</h1><p style={{color:C.gray}}>{items.length} items</p></div><button style={btn(C.primary)} onClick={()=>setShowForm(!showForm)}>+ Add Item</button></div>
      {showForm&&(<div style={{...card,marginBottom:20,borderTop:`3px solid ${C.primary}`}}><h3 style={{fontWeight:800,marginBottom:14}}>New Menu Item</h3><div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:12}}><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Item Name *</label><input style={inp} placeholder="e.g. Jollof Rice" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Price (N) *</label><input style={inp} type="number" placeholder="2500" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} /></div></div><div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>{['Mains','Sides','Drinks','Desserts'].map(c=><button key={c} onClick={()=>setForm({...form,category:c})} style={{...btn(form.category===c?C.primary:'#f5f5f5'),color:form.category===c?'#fff':C.gray,borderRadius:20}}>{c}</button>)}</div><div style={{marginBottom:12}}><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Description</label><textarea style={{...inp,height:70,resize:'vertical'}} placeholder="Describe this item..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} /></div><div style={{marginBottom:16}}><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:8}}>Food Photo</label><div style={{display:'flex',alignItems:'center',gap:14}}>{form.image?(<div style={{position:'relative'}}><img src={form.image} alt="" style={{width:80,height:80,borderRadius:12,objectFit:'cover',border:`2px solid ${C.success}`}} /><button onClick={()=>setForm({...form,image:''})} style={{position:'absolute',top:-8,right:-8,width:22,height:22,borderRadius:'50%',background:C.error,color:'#fff',border:'none',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>x</button></div>):(<div style={{width:80,height:80,borderRadius:12,background:'#f5f5f5',border:`2px dashed ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>O</div>)}<div><label style={{...btn(C.primary),display:'inline-block',cursor:'pointer',padding:'8px 16px'}}>{uploading?'Uploading...':'Upload Photo'}<input type="file" accept="image/*" onChange={handleImageUpload} style={{display:'none'}} disabled={uploading} /></label><p style={{color:C.gray,fontSize:12,marginTop:6}}>JPG, PNG up to 5MB.</p></div></div></div><div style={{display:'flex',gap:8}}><button style={{...btn('#f5f5f5'),color:C.gray}} onClick={()=>setShowForm(false)}>Cancel</button><button style={btn(C.primary)} onClick={add} disabled={uploading}>{uploading?'Uploading image...':'Add to Menu'}</button></div></div>)}
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>{['All','Mains','Sides','Drinks','Desserts'].map(c=><button key={c} onClick={()=>setCat(c)} style={{...btn(cat===c?C.dark:'#fff'),color:cat===c?'#fff':C.gray,border:`1px solid ${C.border}`,borderRadius:20}}>{c}</button>)}</div>
      {filtered.map(item=>(<div key={item._id} style={{...card,display:'flex',alignItems:'center',gap:14}}><div style={{width:72,height:72,borderRadius:12,overflow:'hidden',flexShrink:0,background:'#f5f5f5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>{item.image?<img src={item.image} alt={item.name} style={{width:72,height:72,objectFit:'cover'}} />:'O'}</div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{item.name}</div><div style={{color:C.gray,fontSize:12}}>{item.category}{item.description?` · ${item.description}`:''}</div><div style={{color:C.primary,fontWeight:800,fontSize:15,marginTop:2}}>N{item.price?.toLocaleString()}</div></div><div style={{display:'flex',alignItems:'center',gap:12}}><span style={{color:item.isAvailable?C.success:C.error,fontWeight:600,fontSize:13}}>{item.isAvailable?'Available':'Off'}</span><input type="checkbox" checked={item.isAvailable} onChange={()=>toggle(item)} style={{width:18,height:18,cursor:'pointer'}} /><button onClick={()=>del(item._id)} style={{...btn(C.error),padding:'5px 10px',fontSize:12}}>Del</button></div></div>))}
    </div>
  );
}

function Analytics() {
  const [data,setData]=useState(null);
  useEffect(()=>{ api.get('/restaurants/analytics').then(r=>setData(r.data)).catch(()=>{}); },[]);
  const top=data?.topItems||[]; const maxCount=top.length>0?top[0].count:1;
  const grossRevenue=(data?.allTimeRevenue||0)/0.90; const platformCut=grossRevenue-(data?.allTimeRevenue||0);
  return (
    <div style={{padding:28,overflowY:'auto',flex:1}}>
      <h1 style={{fontSize:26,fontWeight:800,marginBottom:20}}>Analytics</h1>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>{[['TODAY',data?.todayRevenue,data?.todayOrders+' orders'],['THIS WEEK',data?.weekRevenue,data?.weekOrders+' orders'],['THIS MONTH',data?.monthRevenue,data?.monthOrders+' orders'],['ALL TIME',data?.allTimeRevenue,(data?.allTimeOrders||0)+' orders']].map(([l,v,s])=>(<div key={l} style={card}><div style={{color:C.gray,fontSize:10,fontWeight:700,letterSpacing:0.5}}>{l}</div><div style={{fontWeight:800,fontSize:22,margin:'4px 0'}}>N{(v||0).toLocaleString()}</div><div style={{color:C.gray,fontSize:12}}>{s}</div></div>))}</div>
      <div style={{...card,borderTop:`3px solid ${C.error}`,marginBottom:20}}><h3 style={{fontWeight:800,marginBottom:4}}>Earnings Breakdown</h3><p style={{color:C.gray,fontSize:13,marginBottom:16}}>DoorBite deducts 10% from every order as a platform fee</p><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}><div style={{background:'#F0FDF4',borderRadius:12,padding:16,borderLeft:`3px solid ${C.success}`}}><div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:0.5}}>GROSS REVENUE</div><div style={{fontSize:22,fontWeight:800,color:C.success,margin:'4px 0'}}>N{Math.round(grossRevenue).toLocaleString()}</div></div><div style={{background:'#FEF2F2',borderRadius:12,padding:16,borderLeft:`3px solid ${C.error}`}}><div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:0.5}}>DOORBITE CUT (10%)</div><div style={{fontSize:22,fontWeight:800,color:C.error,margin:'4px 0'}}>N{Math.round(platformCut).toLocaleString()}</div></div><div style={{background:'#EFF6FF',borderRadius:12,padding:16,borderLeft:'3px solid #3B82F6'}}><div style={{fontSize:11,fontWeight:700,color:C.gray,letterSpacing:0.5}}>YOUR NET EARNINGS</div><div style={{fontSize:22,fontWeight:800,color:'#3B82F6',margin:'4px 0'}}>N{(data?.allTimeRevenue||0).toLocaleString()}</div></div></div></div>
      <div style={card}><h3 style={{fontWeight:800,marginBottom:16}}>Top Menu Items</h3>{top.length===0?(<p style={{color:C.gray,textAlign:'center',padding:20}}>No orders yet</p>):top.map((item,i)=>(<div key={item.name} style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}><span style={{width:20,color:C.gray,fontWeight:800}}>{i+1}</span><span style={{flex:1,fontWeight:600}}>{item.name}</span><div style={{width:120,height:8,background:'#f5f5f5',borderRadius:4}}><div style={{width:`${(item.count/maxCount)*100}%`,height:'100%',background:C.primary,borderRadius:4}} /></div><span style={{color:C.gray,fontWeight:700,width:40,textAlign:'right'}}>{item.count}x</span></div>))}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><div style={card}><div style={{color:C.gray,fontSize:11,fontWeight:700}}>AVG ORDER VALUE</div><div style={{fontSize:28,fontWeight:800,margin:'4px 0'}}>N{data?.allTimeOrders>0?Math.floor((data?.allTimeRevenue||0)/(data?.allTimeOrders||1)).toLocaleString():0}</div></div><div style={card}><div style={{color:C.gray,fontSize:11,fontWeight:700}}>TOTAL ORDERS</div><div style={{fontSize:28,fontWeight:800,margin:'4px 0'}}>{data?.allTimeOrders||0}</div></div></div>
    </div>
  );
}

function Wallet() {
  const {restaurant}=useAuth();
  const [data,setData]=useState(null); const [withdrawals,setWithdrawals]=useState([]); const [wAmount,setWAmount]=useState(''); const [wLoading,setWLoading]=useState(false); const [loading,setLoading]=useState(true);
  const refresh=()=>{ api.get('/restaurants/analytics').then(r=>setData(r.data)).catch(()=>{}); api.get('/withdrawals/my').then(r=>setWithdrawals(r.data)).catch(()=>{}).finally(()=>setLoading(false)); };
  useEffect(()=>{ refresh(); },[]);
  const requestWithdrawal=async()=>{ const amount=Number(wAmount); if(!amount||amount<100) return alert('Minimum withdrawal is N100'); if(amount>(data?.walletBalance||0)) return alert('Amount exceeds your wallet balance'); if(!restaurant?.bankDetails?.accountNumber) return alert('Please save your bank details in Settings first.'); setWLoading(true); try{ await api.post('/withdrawals',{amount}); alert('Withdrawal request submitted!'); setWAmount(''); refresh(); }catch(err){ alert(err.response?.data?.message||err.message); }finally{ setWLoading(false); } };
  const SC={pending:C.warning,approved:'#3B82F6',processing:'#8B5CF6',paid:C.success,rejected:C.error};
  const statusIcon={pending:'🕐',approved:'✅',processing:'⏳',paid:'✅',rejected:'❌'};
  return (
    <div style={{padding:28,overflowY:'auto',flex:1}}>
      <h1 style={{fontSize:26,fontWeight:800,marginBottom:4}}>Wallet & Withdrawals</h1>
      <p style={{color:C.gray,marginBottom:24}}>Manage your earnings and request payouts to your bank account</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}><div style={{...card,background:C.success,marginBottom:0,color:'#fff'}}><div style={{color:'rgba(255,255,255,0.8)',fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:4}}>AVAILABLE BALANCE</div><div style={{fontSize:32,fontWeight:800,margin:'6px 0'}}>N{(data?.walletBalance||0).toLocaleString()}</div></div><div style={{...card,marginBottom:0}}><div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:4}}>ALL TIME EARNED</div><div style={{fontSize:28,fontWeight:800,margin:'6px 0'}}>N{(data?.allTimeRevenue||0).toLocaleString()}</div></div><div style={{...card,marginBottom:0}}><div style={{color:C.gray,fontSize:11,fontWeight:700,letterSpacing:0.5,marginBottom:4}}>TOTAL ORDERS</div><div style={{fontSize:28,fontWeight:800,margin:'6px 0'}}>{data?.allTimeOrders||0}</div></div></div>
      <div style={{...card,borderTop:`4px solid ${C.success}`,marginBottom:24}}><h2 style={{fontSize:20,fontWeight:800,marginBottom:4}}>Request Withdrawal</h2><p style={{color:C.gray,fontSize:13,marginBottom:20}}>Processed via Paystack directly to your bank account. {!restaurant?.bankDetails?.accountNumber?<span style={{color:C.error,fontWeight:600}}> Add your bank details in Settings first.</span>:<span style={{color:C.success,fontWeight:600}}> Bank account on file.</span>}</p>{restaurant?.bankDetails?.accountNumber&&(<div style={{background:'#F0FDF4',borderRadius:12,padding:14,marginBottom:20,display:'flex',alignItems:'center',gap:12,border:'1px solid #BBF7D0'}}><span style={{fontSize:28}}>🏦</span><div><div style={{fontWeight:700,fontSize:15}}>{restaurant.bankDetails.bankName}</div><div style={{color:C.gray,fontSize:13}}>{restaurant.bankDetails.accountNumber} · {restaurant.bankDetails.accountName}</div></div><span style={{marginLeft:'auto',background:'#DCFCE7',color:C.success,padding:'4px 12px',borderRadius:20,fontWeight:700,fontSize:12}}>Active</span></div>)}<label style={{fontSize:13,fontWeight:700,display:'block',marginBottom:8}}>Amount to Withdraw (N)</label><div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>{[5000,10000,20000,50000].map(amt=><button key={amt} onClick={()=>setWAmount(String(amt))} style={{...btn(Number(wAmount)===amt?C.success:'#f0f0f0',Number(wAmount)===amt?'#fff':C.gray),borderRadius:20,padding:'8px 18px',fontSize:13}}>N{(amt/1000).toFixed(0)}k</button>)}</div><input style={{...inp,fontSize:18,fontWeight:700,height:52,marginBottom:8}} type="number" placeholder="Or enter custom amount" value={wAmount} onChange={e=>setWAmount(e.target.value)} />{wAmount&&Number(wAmount)>0&&<div style={{marginBottom:12,fontSize:13,color:C.gray}}>You will receive: <strong style={{color:C.success,fontSize:15}}>N{Number(wAmount).toLocaleString()}</strong></div>}<button style={{...btn(C.success),padding:'14px 36px',fontSize:16,opacity:(!wAmount||Number(wAmount)<100||wLoading)?0.5:1}} onClick={requestWithdrawal} disabled={!wAmount||Number(wAmount)<100||wLoading}>{wLoading?'Submitting...':'Request Withdrawal'}</button></div>
      <div style={card}><h2 style={{fontSize:18,fontWeight:800,marginBottom:16}}>Withdrawal History</h2>{loading?<p style={{color:C.gray,textAlign:'center',padding:20}}>Loading...</p>:withdrawals.length===0?(<div style={{textAlign:'center',padding:48}}><div style={{fontSize:52,marginBottom:12}}>💸</div><p style={{color:C.gray,fontSize:15,fontWeight:600}}>No withdrawals yet</p></div>):withdrawals.map(w=>(<div key={w._id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 0',borderBottom:`1px solid ${C.border}`}}><div style={{display:'flex',alignItems:'center',gap:14}}><div style={{width:48,height:48,borderRadius:12,background:(SC[w.status]||C.gray)+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>{statusIcon[w.status]||'🕐'}</div><div><div style={{fontWeight:800,fontSize:17}}>N{w.amount?.toLocaleString()}</div><div style={{color:C.gray,fontSize:12,marginTop:2}}>{new Date(w.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · {w.bankDetails?.bankName} · ****{w.bankDetails?.accountNumber?.slice(-4)}</div>{w.adminNote&&<div style={{color:C.warning,fontSize:12,marginTop:3}}>{w.adminNote}</div>}</div></div><div style={{textAlign:'right'}}><span style={{background:(SC[w.status]||C.gray)+'22',color:SC[w.status]||C.gray,padding:'5px 14px',borderRadius:20,fontSize:13,fontWeight:700,textTransform:'capitalize',display:'inline-block',marginBottom:4}}>{w.status}</span>{w.status==='paid'&&<div style={{color:C.success,fontSize:11,fontWeight:600}}>Paid to your bank</div>}</div></div>))}</div>
    </div>
  );
}

function Settings() {
  const {restaurant,setRestaurant}=useAuth();
  const [form,setForm]=useState({name:'',phone:'',address:'',cuisineType:'',description:'',isOpen:false,openTime:'08:00',closeTime:'22:00',logo:''});
  const [location,setLocation]=useState(null);
  const [bankForm,setBankForm]=useState({bankName:'',accountNumber:'',accountName:'',bankCode:''});
  const [saving,setSaving]=useState(false); const [savingBank,setSavingBank]=useState(false); const [uploadingLogo,setUploadingLogo]=useState(false);
  useEffect(()=>{ if(restaurant){ setForm({name:restaurant.name||'',phone:restaurant.phone||'',address:restaurant.address||'',cuisineType:restaurant.cuisineType||'',description:restaurant.description||'',isOpen:restaurant.isOpen||false,openTime:restaurant.openTime||'08:00',closeTime:restaurant.closeTime||'22:00',logo:restaurant.logo||''}); if(restaurant.bankDetails) setBankForm(restaurant.bankDetails); if(restaurant.location?.lat) setLocation({lat:restaurant.location.lat,lng:restaurant.location.lng,address:restaurant.address||''}); } },[restaurant]);
  const handleLogoUpload=async e=>{ const file=e.target.files[0]; if(!file) return; setUploadingLogo(true); try{ const url=await uploadToCloudinary(file); setForm(f=>({...f,logo:url})); const {data}=await api.patch('/restaurants/me',{logo:url}); setRestaurant(data); alert('Restaurant photo updated!'); }catch(err){ alert('Upload failed: '+err.message); }finally{ setUploadingLogo(false); } };
  const save=async()=>{ setSaving(true); try{ const payload={...form}; if(location?.lat) payload.location={lat:location.lat,lng:location.lng}; const {data}=await api.patch('/restaurants/me',payload); setRestaurant(data); alert('Settings saved!'); }catch{ alert('Failed to save'); }finally{ setSaving(false); } };
  const saveBank=async()=>{ if(!bankForm.accountNumber||!bankForm.bankName||!bankForm.accountName) return alert('Please fill in all bank details'); setSavingBank(true); try{ const {data}=await api.patch('/restaurants/me',{bankDetails:bankForm}); setRestaurant(data); alert('Bank details saved!'); }catch{ alert('Failed to save bank details'); }finally{ setSavingBank(false); } };
  return (
    <div style={{padding:28,overflowY:'auto',flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}><h1 style={{fontSize:26,fontWeight:800}}>Settings</h1><button style={btn(C.primary)} onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</button></div>
      <div style={{...card,marginBottom:16}}><h3 style={{fontWeight:800,marginBottom:14}}>Restaurant Photo</h3><p style={{color:C.gray,fontSize:13,marginBottom:16}}>This photo appears on the customer app home screen and restaurant page.</p><div style={{display:'flex',alignItems:'center',gap:20}}><div style={{width:120,height:90,borderRadius:14,overflow:'hidden',background:'#f5f5f5',border:`2px dashed ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,flexShrink:0}}>{form.logo?<img src={form.logo} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />:'O'}</div><div><label style={{...btn(C.primary),display:'inline-block',cursor:'pointer',padding:'10px 20px',fontSize:14}}>{uploadingLogo?'Uploading...':'Upload Photo'}<input type="file" accept="image/*" onChange={handleLogoUpload} style={{display:'none'}} disabled={uploadingLogo} /></label><p style={{color:C.gray,fontSize:12,marginTop:8}}>JPG or PNG, at least 400x300px.</p>{form.logo&&<p style={{color:C.success,fontSize:12,marginTop:4,fontWeight:600}}>Photo uploaded</p>}</div></div></div>
      <div style={{...card,marginBottom:16}}><h3 style={{fontWeight:800,marginBottom:14}}>Restaurant Status</h3><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><span style={{fontWeight:600}}>Currently {form.isOpen?'Open':'Closed'}</span><input type="checkbox" checked={form.isOpen} onChange={e=>setForm({...form,isOpen:e.target.checked})} style={{width:22,height:22,cursor:'pointer',accentColor:C.primary}} /></div><p style={{color:C.gray,fontSize:13,marginBottom:14}}>{form.isOpen?'Accepting orders from customers':'Not accepting orders'}</p><div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:12,alignItems:'end'}}><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Opens</label><input style={inp} value={form.openTime} onChange={e=>setForm({...form,openTime:e.target.value})} /></div><span style={{paddingBottom:10,color:C.gray,fontWeight:700}}>→</span><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Closes</label><input style={inp} value={form.closeTime} onChange={e=>setForm({...form,closeTime:e.target.value})} /></div></div></div>
      <div style={{...card,marginBottom:16}}><h3 style={{fontWeight:800,marginBottom:14}}>Restaurant Details</h3><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>{[['Restaurant Name','name'],['Phone','phone'],['Address','address'],['Cuisine Type','cuisineType']].map(([l,k])=>(<div key={k}><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>{l}</label><input style={inp} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} /></div>))}</div><div style={{marginTop:14}}><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Description</label><textarea style={{...inp,height:90,resize:'vertical'}} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} /></div></div>
      <div style={{...card,marginBottom:16,borderTop:`3px solid ${C.primary}`}}><h3 style={{fontWeight:800,marginBottom:4}}>Restaurant Location</h3><p style={{color:C.gray,fontSize:13,marginBottom:16}}>Used by riders to navigate to your restaurant. Search your address to pin the exact location.</p><LocationPicker value={location} onChange={setLocation} label="Search and pin your restaurant location" /><div style={{marginTop:12,fontSize:12,color:C.gray,background:C.bg,borderRadius:8,padding:10}}>After setting your location, click <strong>Save Changes</strong> at the top to apply it.</div></div>
      <div style={{...card,borderTop:`3px solid ${C.success}`}}><h3 style={{fontWeight:800,marginBottom:4}}>Bank Details for Withdrawals</h3><p style={{color:C.gray,fontSize:13,marginBottom:16}}>Required to receive withdrawal payments via Paystack</p><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Bank Name</label><select style={{...inp,cursor:'pointer',background:'#fff',height:44}} value={bankForm.bankName} onChange={e=>{ const s=NIGERIAN_BANKS.find(b=>b.name===e.target.value); setBankForm({...bankForm,bankName:e.target.value,bankCode:s?.code||''}); }}><option value="">Select your bank...</option>{NIGERIAN_BANKS.map(bank=>(<option key={bank.code} value={bank.name}>{bank.name}</option>))}</select></div><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Account Number</label><input style={inp} placeholder="10-digit number" maxLength={10} value={bankForm.accountNumber} onChange={e=>setBankForm({...bankForm,accountNumber:e.target.value})} /></div><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Account Name</label><input style={inp} placeholder="As on bank records" value={bankForm.accountName} onChange={e=>setBankForm({...bankForm,accountName:e.target.value})} /></div><div><label style={{fontSize:13,fontWeight:600,display:'block',marginBottom:6}}>Bank Code (auto-filled)</label><input style={{...inp,background:'#f9fafb',color:C.gray}} value={bankForm.bankCode} readOnly /></div></div><button style={{...btn(C.success),padding:'10px 24px',fontSize:14}} onClick={saveBank} disabled={savingBank}>{savingBank?'Saving...':'Save Bank Details'}</button></div>
    </div>
  );
}

function AppContent() {
  const {user}=useAuth();
  const [page,setPage]=useState('overview'); const [pendingCount,setPendingCount]=useState(0); const [showRegister,setShowRegister]=useState(false);
  useEffect(()=>{ if(user) api.get('/orders/restaurant').then(r=>setPendingCount(r.data.filter(o=>o.status==='pending').length)).catch(()=>{}); },[user]);
  if(!user) return showRegister?<Register onBack={()=>setShowRegister(false)}/>:<Login onRegister={()=>setShowRegister(true)}/>;
  const pages={overview:<Overview setPage={setPage}/>,orders:<Orders/>,menu:<Menu/>,analytics:<Analytics/>,wallet:<Wallet/>,settings:<Settings/>};
  return (
    <div style={{display:'flex',width:'100%'}}>
      <Sidebar page={page} setPage={setPage} pendingCount={pendingCount} />
      <div style={{flex:1,overflowY:'auto',background:'#F8F8F8'}}>{pages[page]||<Overview setPage={setPage}/>}</div>
    </div>
  );
}

export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }