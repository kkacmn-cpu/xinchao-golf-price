(() => {
  const dataNode = document.getElementById('golf-data');
  const data = dataNode ? JSON.parse(dataNode.textContent) : { courses: [], rates: {} };
  const $ = (selector) => document.querySelector(selector);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatVnd = (value) => `${new Intl.NumberFormat('ko-KR').format(Math.round(value))}동`;
  const formatKrw = (value) => `약 ${new Intl.NumberFormat('ko-KR').format(Math.round(value / 1000) * 1000)}원`;
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
  const compare = new Set();
  const region = $('#price-region');
  const players = $('#price-players');
  const sort = $('#price-sort');
  const date = $('#price-date');
  const tomorrow = new Date(Date.now() + 86400000 * 7);
  if (date && !date.value) date.value = tomorrow.toISOString().slice(0, 10);

  function effectivePrice(course) {
    const selectedDate = date?.value || '';
    const conditions = (course.price?.conditions || []).filter((item) => (!selectedDate || !item.validFrom || item.validFrom <= selectedDate) && (!selectedDate || !item.validTo || item.validTo >= selectedDate));
    if (!conditions.length) return null;
    const pricedConditions = conditions.map((item) => ({ item, price: Number(item.price) })).filter(({ price }) => Number.isFinite(price) && price > 0);
    if (!pricedConditions.length) return null;
    const minVnd = Math.min(...pricedConditions.map(({ price }) => price));
    const maxVnd = Math.max(...pricedConditions.map(({ price }) => price));
    const minCondition = pricedConditions.find(({ price }) => price === minVnd)?.item?.condition || '조건 확인 필요';
    const usdToVnd = Number(data.rates.usdToVnd || 0);
    const usdToKrw = Number(data.rates.usdToKrw || 0);
    const toKrw = (vnd) => usdToVnd > 0 && usdToKrw > 0 ? vnd / usdToVnd * usdToKrw : 0;
    return { minVnd, maxVnd, minVndText: formatVnd(minVnd), minKrw: toKrw(minVnd), minCondition };
  }

  function visibleCourses() {
    const regionId = region?.value || '';
    const mode = sort?.value || 'low';
    const output = priced.filter((course) => !regionId || course.region_id === regionId).map((course) => ({ ...course, effective: effectivePrice(course) })).filter((course) => course.effective);
    output.sort((a, b) => mode === 'high' ? b.effective.minVnd - a.effective.minVnd : mode === 'name' ? a.name_ko.localeCompare(b.name_ko, 'ko') : a.effective.minVnd - b.effective.minVnd);
    return output.slice(0, 8);
  }

  function row(course) {
    const price = course.effective || course.price;
    return `<article class="price-row" data-price-course data-region="${esc(course.region_id)}"><div><span class="region-label">${esc(course.region_ko)}</span><h3>${esc(course.name_ko)}</h3><p>${esc(course.official_name)}</p></div><div class="price-cell"><strong>${esc(price.minVndText)}</strong><span>${esc(price.minCondition)} · 1인 참고</span><small>${formatKrw(price.minKrw)} 환산 · 현재가 재확인</small></div><div class="row-actions"><button type="button" class="compare-toggle" data-compare-id="${esc(course.course_id)}" aria-pressed="${compare.has(course.course_id)}">${compare.has(course.course_id) ? '비교에서 빼기' : '비교 담기'}</button><a href="/golf/${esc(course.region_id)}/${esc(course.course_id)}/">조건 보기</a></div></article>`;
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
    target.innerHTML = selected.map((course) => `<article class="compare-card"><span>${esc(course.region_ko)}</span><h3>${esc(course.name_ko)}</h3><strong>${formatVnd(course.effective.minVnd * count)}부터</strong><span>${count}인 참고 합계 · 1인 ${esc(course.effective.minVndText)}부터</span><button type="button" data-remove-compare="${esc(course.course_id)}">비교에서 빼기</button></article>`).join('');
  }

  function render() {
    const items = visibleCourses();
    const list = $('#price-list');
    if (list) list.innerHTML = items.map(row).join('');
    $('#price-empty').hidden = items.length > 0;
    $('#price-count').textContent = `${items.length}개`;
    const count = Number(players?.value || 4);
    $('#price-team-min').textContent = items[0] ? formatVnd(items[0].effective.minVnd * count) : '확인 필요';
    renderCompare();
  }

  priceForm.addEventListener('submit', (event) => { event.preventDefault(); render(); });
  region?.addEventListener('change', render);
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
  render();
})();
