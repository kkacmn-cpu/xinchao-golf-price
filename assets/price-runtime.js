(() => {
  const dataNode = document.getElementById('golf-data');
  const data = dataNode ? JSON.parse(dataNode.textContent) : { courses: [], rates: {} };
  const $ = (selector) => document.querySelector(selector);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatVnd = (value) => `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}동`;
  const menuButton = $('.menu-toggle');
  const mobileMenu = $('#mobile-menu');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    menuButton.querySelector('[aria-hidden]')?.replaceChildren(document.createTextNode(open ? '☰' : '×'));
    if (mobileMenu) mobileMenu.hidden = open;
  });
  mobileMenu?.addEventListener('click', () => { mobileMenu.hidden = true; menuButton?.setAttribute('aria-expanded', 'false'); });

  const priceForm = $('#price-filter');
  if (!priceForm) return;

  const priced = data.courses.filter((course) => course.price?.available);
  const latestValidTo = priced.flatMap((course) => course.price.conditions || []).reduce((latest, item) => item.validTo > latest ? item.validTo : latest, '');
  const compare = new Set();
  const region = $('#price-region');
  const players = $('#price-players');
  const sort = $('#price-sort');
  const date = $('#price-date');
  const courseFilter = $('#price-course');
  const audience = $('#price-audience');
  const cart = $('#price-cart');
  if (date && !date.value) date.value = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const range = (min, max) => min === max ? formatVnd(min) : `${formatVnd(min)} ~ ${formatVnd(max)}`;
  function syncCourses() {
    const current = courseFilter.value;
    const choices = data.courses.filter((item) => !region.value || item.region_id === region.value).sort((a, b) => a.name_ko.localeCompare(b.name_ko, 'ko'));
    courseFilter.innerHTML = `<option value="">전체 골프장</option>${choices.map((item) => `<option value="${esc(item.course_id)}">${esc(item.name_ko)} · ${esc(item.region_ko)}${item.price?.available ? '' : ' · 공개가격 없음'}</option>`).join('')}`;
    if (choices.some((item) => item.course_id === current)) courseFilter.value = current;
  }
  function effectivePrice(course) {
    const selectedDate = date?.value || '';
    if (!selectedDate || !course?.price?.available) return null;
    const isoWeekday = new Date(`${selectedDate}T12:00:00Z`).getUTCDay() || 7;
    const conditions = (course.price.conditions || []).filter((item) => {
      const tags = item.audienceTags || [];
      const audienceMatch = audience.value === 'undocumented' ? tags.length === 0 : audience.value === 'inbound' ? tags.some((tag) => tag === 'INBOUND' || tag === 'VN_EQUALS_INBOUND') : tags.includes('OTHER_GUEST');
      return item.validFrom && item.validTo && item.validFrom <= selectedDate && selectedDate <= item.validTo && audienceMatch && item.buggyIncluded === (cart.value === 'included');
    });
    const pricedConditions = conditions.map((item) => {
      const weekdayPrices = item.priceByIsoWeekday;
      const price = weekdayPrices ? Number(weekdayPrices[String(isoWeekday)]) : Number(item.price);
      return { item, price };
    }).filter(({ price }) => Number.isFinite(price) && price > 0);
    if (!pricedConditions.length) return null;
    const minVnd = Math.min(...pricedConditions.map(({ price }) => price));
    const maxVnd = Math.max(...pricedConditions.map(({ price }) => price));
    return { minVnd, maxVnd, conditionCount: pricedConditions.length };
  }

  function visibleCourses() {
    const regionId = region?.value || '';
    const mode = sort?.value || 'low';
    const output = priced.filter((course) => (!regionId || course.region_id === regionId) && (!courseFilter.value || course.course_id === courseFilter.value)).map((course) => ({ ...course, effective: effectivePrice(course) })).filter((course) => course.effective);
    output.sort((a, b) => mode === 'high' ? b.effective.minVnd - a.effective.minVnd : mode === 'name' ? a.name_ko.localeCompare(b.name_ko, 'ko') : a.effective.minVnd - b.effective.minVnd);
    return output;
  }

  function row(course) {
    const price = course.effective;
    return `<article class="price-row" data-price-course data-region="${esc(course.region_id)}"><div><span class="region-label">${esc(course.region_ko)}</span><h3>${esc(course.name_ko)}</h3><p>${esc(course.official_name)}</p></div><div class="price-cell"><strong>${range(price.minVnd, price.maxVnd)}</strong><span>선택일 일치 규칙 ${price.conditionCount}건 · 1인 공개 참고범위</span><small>카트 ${cart.value === 'included' ? '포함 기록' : '별도 기록'} · 그린피·캐디·티오프·최종가 확인 필요</small></div><div class="row-actions"><button type="button" class="compare-toggle" data-compare-id="${esc(course.course_id)}" aria-pressed="${compare.has(course.course_id)}">${compare.has(course.course_id) ? '비교에서 빼기' : '비교 담기'}</button><a href="/golf/${esc(course.region_id)}/${esc(course.course_id)}/">조건 보기</a></div></article>`;
  }

  function renderCompare() {
    const target = $('#compare-table');
    if (!target) return;
    const selected = [...compare].map((id) => data.courses.find((course) => course.course_id === id)).filter(Boolean).map((course) => ({ ...course, effective: effectivePrice(course) })).filter((course) => course.effective);
    if (!selected.length) {
      target.className = 'compare-placeholder';
      target.textContent = '아직 담은 골프장이 없습니다.';
      return;
    }
    const count = Number(players?.value || 4);
    target.className = 'compare-grid';
    target.innerHTML = selected.map((course) => `<article class="compare-card"><span>${esc(course.region_ko)}</span><h3>${esc(course.name_ko)}</h3><strong>${range(course.effective.minVnd * count, course.effective.maxVnd * count)}</strong><span>${count}인 공개 참고범위 · 카트 ${cart.value === 'included' ? '포함 기록' : '별도 기록'} · 그린피·캐디 확인 필요</span><button type="button" data-remove-compare="${esc(course.course_id)}">비교에서 빼기</button></article>`).join('');
  }

  function render() {
    const items = visibleCourses();
    for (const id of compare) if (!items.some((item) => item.course_id === id)) compare.delete(id);
    const list = $('#price-list');
    if (list) list.innerHTML = items.map(row).join('');
    const empty = $('#price-empty');
    empty.hidden = items.length > 0;
    if (!items.length) empty.textContent = date.value > latestValidTo ? `기록된 가격의 유효기간은 ${latestValidTo}까지입니다. 이후 날짜의 가격은 미확인으로 표시합니다.` : courseFilter.value && !data.courses.find((item) => item.course_id === courseFilter.value)?.price?.available ? '이 골프장의 가격 자료는 없습니다. 조건 페이지에서 확인 항목을 보세요.' : '선택한 날짜·고객군·카트 조건에 일치하는 가격 기록이 없습니다. 현재가로 추정하지 않습니다.';
    $('#price-count').textContent = `${items.length}개`;
    const count = Number(players?.value || 4);
    const selected = items.find((item) => item.course_id === courseFilter.value);
    $('#price-team-min').textContent = selected ? range(selected.effective.minVnd * count, selected.effective.maxVnd * count) : courseFilter.value ? '조건 일치 가격 없음' : '골프장 선택 필요';
    const sectionIntro = $('.price-results .section-head p');
    if (sectionIntro) sectionIntro.textContent = `2026.09.23 자료의 날짜·고객군·카트 조건에 일치하는 기록 범위입니다. 유효기간은 ${latestValidTo}까지이며 그린피·캐디·티오프·최종가는 별도 확인해야 합니다.`;
    renderCompare();
  }

  priceForm.addEventListener('submit', (event) => { event.preventDefault(); render(); });
  region?.addEventListener('change', () => { syncCourses(); render(); });
  courseFilter?.addEventListener('change', render);
  audience?.addEventListener('change', render);
  cart?.addEventListener('change', render);
  date?.addEventListener('change', render);
  players?.addEventListener('change', render);
  sort?.addEventListener('change', render);
  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-compare-id]');
    const remove = event.target.closest('[data-remove-compare]');
    const id = add?.dataset.compareId || remove?.dataset.removeCompare;
    if (!id) return;
    if (compare.has(id)) compare.delete(id);
    else if (compare.size < 3) compare.add(id);
    else {
      const target = $('#compare-table');
      target.className = 'compare-placeholder';
      target.textContent = '비교는 최대 3곳까지 가능합니다. 한 곳을 뺀 뒤 다시 담으세요.';
      return;
    }
    render();
  });
  syncCourses();
  render();
})();
