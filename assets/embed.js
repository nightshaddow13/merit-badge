// Tools open inside the Warden Log's Tools tab with ?embed=1: hide the site header and footer so only the tool shows.
(function () {
  if (!/[?&]embed=1\b/.test(location.search)) return;
  var s = document.createElement("style");
  s.textContent = "header.top,div.top,.skip,footer,.foot,.hero{display:none!important}body{padding-top:0!important}";
  document.head.appendChild(s);
  document.documentElement.classList.add("embed");
})();
