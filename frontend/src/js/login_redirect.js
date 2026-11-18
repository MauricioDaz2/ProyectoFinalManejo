(() => {
    'use strict';
    location.replace(new URL('../public/index.html?login=1', location.href).href);
})();
