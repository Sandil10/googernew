1:"$Sreact.fragment"
3:I[60630,["/_next/static/chunks/46fea3afa62a1818.js"],"CartProvider"]
4:I[57218,["/_next/static/chunks/46fea3afa62a1818.js"],"default"]
5:I[39756,["/_next/static/chunks/ff1a16fafef87110.js","/_next/static/chunks/d2be314c3ece3fbe.js"],"default"]
6:I[37457,["/_next/static/chunks/ff1a16fafef87110.js","/_next/static/chunks/d2be314c3ece3fbe.js"],"default"]
7:I[79520,["/_next/static/chunks/46fea3afa62a1818.js"],""]
:HL["/_next/static/chunks/34d933785a17edf3.css","style"]
:HL["/_next/static/chunks/1b7ef7a12f8c88dd.css","style"]
2:T47c,
              (function () {
                try {
                  var pref = localStorage.getItem('googer-theme-mode') || 'system';
                  var resolved = pref === 'system'
                    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                    : pref;
                  document.documentElement.dataset.theme = resolved;
                  document.documentElement.dataset.themePreference = pref;
                  document.documentElement.style.colorScheme = resolved;
                  document.documentElement.classList.toggle('light-theme', resolved === 'light');
                  document.documentElement.classList.toggle('dark-theme', resolved === 'dark');
                  document.addEventListener('DOMContentLoaded', function () {
                    document.body.dataset.theme = resolved;
                    document.body.classList.toggle('light-theme', resolved === 'light');
                    document.body.classList.toggle('dark-theme', resolved === 'dark');
                  });
                } catch (e) {}
              })();
            0:{"buildId":"p9LuW7OPiRVV9tGHpS-Ft","rsc":["$","$1","c",{"children":[[["$","link","0",{"rel":"stylesheet","href":"/_next/static/chunks/34d933785a17edf3.css","precedence":"next"}],["$","link","1",{"rel":"stylesheet","href":"/_next/static/chunks/1b7ef7a12f8c88dd.css","precedence":"next"}],["$","script","script-0",{"src":"/_next/static/chunks/46fea3afa62a1818.js","async":true}]],["$","html",null,{"lang":"en","suppressHydrationWarning":true,"children":[["$","head",null,{"children":[["$","meta",null,{"httpEquiv":"Content-Security-Policy","content":"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://static.cloudflareinsights.com; object-src 'none';"}],["$","script",null,{"dangerouslySetInnerHTML":{"__html":"$2"}}]]}],["$","body",null,{"className":"geist_a71539c9-module__T19VSG__variable geist_mono_8d43a2aa-module__8Li5zG__variable antialiased","suppressHydrationWarning":true,"children":[["$","$L3",null,{"children":[["$","$L4",null,{}],["$","$L5",null,{"parallelRouterKey":"children","template":["$","$L6",null,{}],"notFound":[[["$","title",null,{"children":"404: This page could not be found."}],["$","div",null,{"style":{"fontFamily":"system-ui,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif,\"Apple Color Emoji\",\"Segoe UI Emoji\"","height":"100vh","textAlign":"center","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center"},"children":["$","div",null,{"children":[["$","style",null,{"dangerouslySetInnerHTML":{"__html":"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}"}}],["$","h1",null,{"className":"next-error-h1","style":{"display":"inline-block","margin":"0 20px 0 0","padding":"0 23px 0 0","fontSize":24,"fontWeight":500,"verticalAlign":"top","lineHeight":"49px"},"children":404}],["$","div",null,{"style":{"display":"inline-block"},"children":["$","h2",null,{"style":{"fontSize":14,"fontWeight":400,"lineHeight":"49px","margin":0},"children":"This page could not be found."}]}]]}]}]],[]]}]]}],["$","$L7",null,{"type":"module","src":"https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js","strategy":"lazyOnload"}]]}]]}]]}],"loading":[["$","div","l",{"className":"flex flex-col gap-3 justify-center items-center h-screen bg-black","children":[["$","div",null,{"className":"animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"}],["$","div",null,{"className":"text-gray-500 font-medium tracking-wide","children":"Loading..."}]]}],[],[]],"isPartial":false}
