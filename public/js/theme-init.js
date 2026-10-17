// Mövzunu səhifə çəkilməzdən əvvəl tətbiq edir (ağ/qara parıltının qarşısını alır)
try {
  var t = localStorage.getItem('pj-theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) { /* ignore */ }
