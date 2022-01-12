"use strict";

const CLEOPATRA = "Cleopatra";
const DEAD = "Dead";
const LEVY = "Levy";
const ENEMY = { "Caesar": "Pompeius", "Pompeius": "Caesar" };

let label_style = window.localStorage['julius-caesar/label-style'] || 'columbia';
let label_layout = window.localStorage['julius-caesar/label-layout'] || 'spread';

function toggle_blocks() {
	document.getElementById("blocks").classList.toggle("hide_blocks");
}

function set_simple_labels() {
	label_style = 'simple';
	document.getElementById("blocks").classList.remove("columbia-labels");
	document.getElementById("battle").classList.remove("columbia-labels");
	document.getElementById("blocks").classList.add("simple-labels");
	document.getElementById("battle").classList.add("simple-labels");
	window.localStorage['julius-caesar/label-style'] = label_style;
	update_map();
}

function set_columbia_labels() {
	label_style = 'columbia';
	document.getElementById("blocks").classList.remove("simple-labels");
	document.getElementById("battle").classList.remove("simple-labels");
	document.getElementById("blocks").classList.add("columbia-labels");
	document.getElementById("battle").classList.add("columbia-labels");
	window.localStorage['julius-caesar/label-style'] = label_style;
	update_map();
}

function set_spread_layout() {
	label_layout = 'spread';
	window.localStorage['julius-caesar/label-layout'] = label_layout;
	update_map();
}

function set_stack_layout() {
	label_layout = 'stack';
	window.localStorage['julius-caesar/label-layout'] = label_layout;
	update_map();
}

// Levy and hit animations for 'simple' blocks.
const step_down_animation = [
		{ transform: 'translateY(0px)' },
		{ transform: 'translateY(10px)' },
		{ transform: 'translateY(0px)' },
];
const step_up_animation = [
		{ transform: 'translateY(0px)' },
		{ transform: 'translateY(-10px)' },
		{ transform: 'translateY(0px)' },
];

let ui = {
	cards: {},
	card_backs: {},
	spaces: {},
	blocks: {},
	battle_menu: {},
	battle_block: {},
	old_steps: null,
	old_location: null,
	present: new Set(),
};

create_log_entry = function (text) {
	let p = document.createElement("div");
	text = text.replace(/&/g, "&amp;");
	text = text.replace(/</g, "&lt;");
	text = text.replace(/>/g, "&gt;");

	text = text.replace(/\u2192 /g, "\u2192\xa0");
	text = text.replace(/Mare /g, "Mare\xa0");

	text = text.replace(/^([A-Z]):/, '<span class="$1"> $1 </span>');

	if (text.match(/^~ .* ~$/))
		p.className = 'br', text = text.substring(2, text.length-2);
	else if (text.match(/^Start Caesar turn/))
		p.className = 'C';
	else if (text.match(/^Start Pompeius turn/))
		p.className = 'P';
	else if (text.match(/^Start /))
		p.className = 'st', text = text.replace(/\.$/, "");
	else if (text.match(/^Battle in/))
		p.className = 'bs';

	if (text.match(/^Start /))
		text = text.substring(6);

	p.innerHTML = text;
	return p;
}

function on_focus_space(evt) {
	document.getElementById("status").textContent = evt.target.space;
}

function on_blur_space(evt) {
	document.getElementById("status").textContent = "";
}

function on_click_space(evt) {
	send_action('space', evt.target.space);
}

const STEPS = [ 0, "I", "II", "III", "IIII" ];

function block_description(b) {
	if (is_known_block(b)) {
		let s = BLOCKS[b].steps;
		let c = BLOCKS[b].initiative + BLOCKS[b].firepower;
		let levy = BLOCKS[b].levy;
		if (levy)
			return BLOCKS[b].name + " (" + levy + ") " + STEPS[s] + "-" + c;
		return BLOCKS[b].name + " " + STEPS[s] + "-" + c;
	}
	return block_owner(b);
}

function block_owner(who) {
	if (who in view.owner)
		return view.owner[who];
	return BLOCKS[who].owner;
}

function block_name(b) {
	return BLOCKS[b].name;
}

function on_focus_map_block(evt) {
	document.getElementById("status").textContent = block_description(evt.target.block);
}

function on_blur_map_block(evt) {
	document.getElementById("status").textContent = "";
}

function on_focus_battle_block(evt) {
	let b = evt.target.block;
	let msg = block_name(b);
	if (!evt.target.classList.contains("known"))
		document.getElementById("status").textContent = "Reserves";

	if (view.actions && view.actions.battle_fire && view.actions.battle_fire.includes(b))
		msg = "Fire with " + msg;
	else if (view.actions && view.actions.battle_retreat && view.actions.battle_retreat.includes(b))
		msg = "Retreat with " + msg;
	else if (view.actions && view.actions.battle_hit && view.actions.battle_hit.includes(b))
		msg = "Take hit on " + msg;

	document.getElementById("status").textContent = msg;
}

function on_blur_battle_block(evt) {
	document.getElementById("status").textContent = "";
}

function on_focus_battle_fire(evt) {
	document.getElementById("status").textContent =
		"Fire with " + block_name(evt.target.block);
}

function on_focus_battle_retreat(evt) {
	document.getElementById("status").textContent =
		"Retreat with " + block_name(evt.target.block);
}

function on_focus_battle_pass(evt) {
	document.getElementById("status").textContent =
		"Pass with " + block_name(evt.target.block);
}

function on_focus_battle_hit(evt) {
	document.getElementById("status").textContent =
		"Take hit on " + block_name(evt.target.block);
}

function on_blur_battle_button(evt) {
	document.getElementById("status").textContent = "";
}

function on_click_battle_block(evt) { send_action('block', evt.target.block); }
function on_click_battle_hit(evt) { send_action('battle_hit', evt.target.block); }
function on_click_battle_fire(evt) { send_action('battle_fire', evt.target.block); }
function on_click_battle_retreat(evt) { send_action('battle_retreat', evt.target.block); }

function on_click_battle_pass(evt) {
	if (window.confirm("Are you sure that you want to PASS with " + block_name(evt.target.block) + "?"))
		send_action('battle_pass', evt.target.block);
}

function on_click_map_block(evt) {
	let b = evt.target.block;
	let s = view.location[b];
	if (view.actions && view.actions.secret && view.actions.secret.includes(s))
		send_action('secret', [s, BLOCKS[b].color]);
	else if (!view.battle)
		send_action('block', b);
}

function build_map() {
	// These must match up with the sizes in play.html
	const city_size = 60+10;
	const sea_size = 70+10;

	ui.blocks_element = document.getElementById("blocks");
	ui.offmap_element = document.getElementById("offmap");
	ui.spaces_element = document.getElementById("spaces");

	for (let s in SPACES) {
		let space = SPACES[s];
		let element = document.createElement("div");
		element.classList.add("space");
		let size = (space.type === 'sea') ? sea_size : city_size;
		if (space.type === "sea")
			element.classList.add("sea");
		else
			element.classList.add("city");
		element.setAttribute("draggable", "false");
		element.addEventListener("mouseenter", on_focus_space);
		element.addEventListener("mouseleave", on_blur_space);
		element.addEventListener("click", on_click_space);
		element.style.left = (space.x - size/2) + "px";
		element.style.top = (space.y - size/2) + "px";
		if (space.type !== 'pool')
			document.getElementById("spaces").appendChild(element);
		element.space = s;
		ui.spaces[s] = element;
	}

	function build_map_block(b, block) {
		let element = document.createElement("div");
		element.classList.add("block");
		element.classList.add("known");
		element.classList.add(block.color);
		element.classList.add("block_"+block.label);
		element.addEventListener("mouseenter", on_focus_map_block);
		element.addEventListener("mouseleave", on_blur_map_block);
		element.addEventListener("click", on_click_map_block);
		element.block = b;
		ui.blocks[b] = element;
	}

	function build_battle_button(menu, b, c, click, enter, img_src) {
		let img = new Image();
		img.draggable = false;
		img.classList.add("action");
		img.classList.add(c);
		img.setAttribute("src", img_src);
		img.addEventListener("click", click);
		img.addEventListener("mouseenter", enter);
		img.addEventListener("mouseleave", on_blur_battle_button);
		img.block = b;
		menu.appendChild(img);
	}

	function build_battle_block(b, block) {
		let element = document.createElement("div");
		element.classList.add("block");
		element.classList.add(block.color);
		element.classList.add("block_"+block.label);
		element.addEventListener("mouseenter", on_focus_battle_block);
		element.addEventListener("mouseleave", on_blur_battle_block);
		element.addEventListener("click", on_click_battle_block);
		element.block = b;
		ui.battle_block[b] = element;

		let action_list = document.createElement("div");
		action_list.classList.add("battle_menu_list");
		action_list.appendChild(element);
		build_battle_button(action_list, b, "hit",
			on_click_battle_hit, on_focus_battle_hit,
			"/images/cross-mark.svg");
		build_battle_button(action_list, b, "fire",
			on_click_battle_fire, on_focus_battle_fire,
			"/images/pointy-sword.svg");
		build_battle_button(action_list, b, "retreat",
			on_click_battle_retreat, on_focus_battle_retreat,
			"/images/flying-flag.svg");
		build_battle_button(action_list, b, "pass",
			on_click_battle_pass, on_focus_battle_pass,
			"/images/sands-of-time.svg");

		let menu = document.createElement("div");
		menu.classList.add("battle_menu");
		menu.appendChild(element);
		menu.appendChild(action_list);
		ui.battle_menu[b] = menu;
	}

	for (let b in BLOCKS) {
		let block = BLOCKS[b];
		block.color = (block.name === "Cleopatra" ? "Cleopatra" : block.owner);
		build_map_block(b, block);
		build_battle_block(b, block);
	}

	for (let c = 1; c <= 27; ++c)
		ui.cards[c] = document.getElementById("card+" + c);
	for (let c = 1; c <= 6; ++c)
		ui.card_backs[c] = document.getElementById("back+" + c);
}

function update_steps(block, element, animate) {
	let old_steps = ui.old_steps[block] || view.steps[block];
	let steps = view.steps[block];
	if (view.location[block] !== ui.old_location[block])
		animate = false;

	if (label_style === 'simple' && steps !== old_steps && animate) {
		let options = { duration: 700, easing: 'ease', iterations: Math.abs(steps-old_steps) }
		if (steps < old_steps)
			element.animate(step_down_animation, options);
		if (steps > old_steps)
			element.animate(step_up_animation, options);
	}

	element.classList.remove("r0");
	element.classList.remove("r1");
	element.classList.remove("r2");
	element.classList.remove("r3");
	element.classList.add("r"+(BLOCKS[block].steps - steps));
}

function layout_blocks(location, north, south) {
	if (label_layout === 'spread' || (location === LEVY || location === DEAD))
		layout_blocks_spread(location, north, south);
	else
		layout_blocks_stacked(location, north, south);
}

function layout_blocks_spread(location, north, south) {
	let wrap = SPACES[location].wrap;
	let s = north.length;
	let k = south.length;
	let n = s + k;
	let row, rows = [];
	let i = 0;

	function new_line() {
		rows.push(row = []);
		i = 0;
	}

	new_line();

	while (north.length > 0) {
		if (i === wrap)
			new_line();
		row.push(north.shift());
		++i;
	}

	// Break early if north and south fit in exactly two rows and more than two blocks.
	if (s > 0 && s <= wrap && k > 0 && k <= wrap && n > 2)
		new_line();

	while (south.length > 0) {
		if (i === wrap)
			new_line();
		row.push(south.shift());
		++i;
	}

	if (SPACES[location].layout_minor > 0.5)
		rows.reverse();

	for (let j = 0; j < rows.length; ++j)
		for (i = 0; i < rows[j].length; ++i)
			position_block_spread(location, j, rows.length, i, rows[j].length, rows[j][i]);
}

function position_block_spread(location, row, n_rows, col, n_cols, element) {
	let space = SPACES[location];
	let block_size = (label_style === 'columbia') ? 56+6 : 48+4;
	let padding = (location === LEVY || location === DEAD) ? 6 : 3;
	let offset = block_size + padding;
	let row_size = (n_rows-1) * offset;
	let col_size = (n_cols-1) * offset;
	let x = space.x - block_size/2;
	let y = space.y - block_size/2;

	if (space.layout_axis === 'X') {
		x -= col_size * space.layout_major;
		y -= row_size * space.layout_minor;
		x += col * offset;
		y += row * offset;
	} else {
		y -= col_size * space.layout_major;
		x -= row_size * space.layout_minor;
		y += col * offset;
		x += row * offset;
	}

	element.style.left = (x|0)+"px";
	element.style.top = (y|0)+"px";
}

function layout_blocks_stacked(location, secret, known) {
	let s = secret.length;
	let k = known.length;
	let both = secret.length > 0 && known.length > 0;
	let i = 0;
	while (secret.length > 0)
		position_block_stacked(location, i++, (s-1)/2, both ? 1 : 0, secret.shift());
	i = 0;
	while (known.length > 0)
		position_block_stacked(location, i++, (k-1)/2, 0, known.shift());
}

function position_block_stacked(location, i, c, k, element) {
	let space = SPACES[location];
	let block_size = (label_style === 'columbia') ? 56+6 : 48+4;
	let x = space.x + (i - c) * 16 + k * 12;
	let y = space.y + (i - c) * 16 - k * 12;
	element.style.left = ((x - block_size/2)|0)+"px";
	element.style.top = ((y - block_size/2)|0)+"px";
}

function show_block(element) {
	if (element.parentElement !== ui.blocks_element)
		ui.blocks_element.appendChild(element);
}

function hide_block(element) {
	if (element.parentElement !== ui.offmap_element)
		ui.offmap_element.appendChild(element);
}

function is_known_block(who) {
	if (view.game_over && player === 'Observer')
		return true;
	if (block_owner(who) === player)
		return true;
	let where = view.location[who];
	if (where === DEAD)
		return true;
	return false;
}

function is_visible_block(where, who) {
	if (view.game_over && player === 'Observer')
		return true;
	if (where === "Levy")
		return block_owner(who) === player;
	return true;
}

function update_map() {
	let layout = {};

	for (let s in SPACES)
		layout[s] = { north: [], south: [] };

	for (let b in view.location) {
		let info = BLOCKS[b];
		let element = ui.blocks[b];
		let space = view.location[b];
		if (is_visible_block(space, b)) {
			let moved = view.moved[b] ? " moved" : "";
			if (space === DEAD && info.type !== 'leader')
				moved = " moved";
			if (is_known_block(b)) {
				let image = " block_" + info.label;
				let known = " known";
				let jupiter = "";
				if (block_owner(b) !== BLOCKS[b].owner && view.game_over)
					jupiter = " jupiter";
				element.classList = info.color + known + " block" + image + moved + jupiter;
				update_steps(b, element, true);
			} else {
				let jupiter = "";
				let mars = "";
				let neptune = "";
				if (block_owner(b) !== BLOCKS[b].owner)
					jupiter = " jupiter";
				if (block_owner(b) === view.mars && space === view.surprise)
					mars = " mars";
				if (block_owner(b) === view.neptune && space === view.surprise)
					neptune = " neptune";
				element.classList = info.color + " block" + moved + jupiter + mars + neptune;
			}
			if (block_owner(b) === CAESAR)
				layout[space].north.push(element);
			else
				layout[space].south.push(element);
			show_block(element);
		} else {
			hide_block(element);
		}
	}

	for (let space in SPACES)
		layout_blocks(space, layout[space].north, layout[space].south);

	// Mark selections and highlights

	for (let where in SPACES) {
		if (ui.spaces[where]) {
			ui.spaces[where].classList.remove('highlight');
			ui.spaces[where].classList.remove('where');
		}
	}
	if (view.actions && view.actions.space)
		for (let where of view.actions.space)
			ui.spaces[where].classList.add('highlight');

	for (let b in BLOCKS) {
		ui.blocks[b].classList.remove('highlight');
		ui.blocks[b].classList.remove('selected');
	}
	if (!view.battle) {
		if (view.actions && view.actions.block)
			for (let b of view.actions.block)
				ui.blocks[b].classList.add('highlight');
		if (view.who)
			ui.blocks[view.who].classList.add('selected');
	}

	for (let b in BLOCKS) {
		let s = view.location[b];
		if (view.actions && view.actions.secret && view.actions.secret.includes(s))
			ui.blocks[b].classList.add('highlight');
	}
}

function update_battle() {
	function fill_cell(name, list, reserve) {
		let cell = window[name];

		ui.present.clear();

		for (let block of list) {
			ui.present.add(block);

			if (block === view.who)
				ui.battle_menu[block].classList.add("selected");
			else
				ui.battle_menu[block].classList.remove("selected");

			ui.battle_block[block].classList.remove("highlight");
			ui.battle_menu[block].classList.remove('hit');
			ui.battle_menu[block].classList.remove('fire');
			ui.battle_menu[block].classList.remove('retreat');
			ui.battle_menu[block].classList.remove('pass');

			if (view.actions && view.actions.block && view.actions.block.includes(block))
				ui.battle_block[block].classList.add("highlight");
			if (view.actions && view.actions.battle_fire && view.actions.battle_fire.includes(block))
				ui.battle_menu[block].classList.add('fire');
			if (view.actions && view.actions.battle_retreat && view.actions.battle_retreat.includes(block))
				ui.battle_menu[block].classList.add('retreat');
			if (view.actions && view.actions.battle_pass && view.actions.battle_pass.includes(block))
				ui.battle_menu[block].classList.add('pass');
			if (view.actions && view.actions.battle_hit && view.actions.battle_hit.includes(block))
				ui.battle_menu[block].classList.add('hit');

			update_steps(block, ui.battle_block[block], true);
			if (reserve)
				ui.battle_block[block].classList.add("secret");
			else
				ui.battle_block[block].classList.remove("secret");
			if (view.moved[block] || reserve)
				ui.battle_block[block].classList.add("moved");
			else
				ui.battle_block[block].classList.remove("moved");
			if (reserve)
				ui.battle_block[block].classList.remove("known");
			else
				ui.battle_block[block].classList.add("known");
		}

		for (let b in BLOCKS) {
			if (ui.present.has(b)) {
				if (!cell.contains(ui.battle_menu[b]))
					cell.appendChild(ui.battle_menu[b]);
			} else {
				if (cell.contains(ui.battle_menu[b]))
					cell.removeChild(ui.battle_menu[b]);
			}
		}
	}

	if (player === CAESAR) {
		fill_cell("FR", view.battle.CR, true);
		fill_cell("FA", view.battle.CA, false);
		fill_cell("FB", view.battle.CB, false);
		fill_cell("FC", view.battle.CC, false);
		fill_cell("FD", view.battle.CD, false);
		fill_cell("EA", view.battle.PA, false);
		fill_cell("EB", view.battle.PB, false);
		fill_cell("EC", view.battle.PC, false);
		fill_cell("ED", view.battle.PD, false);
		fill_cell("ER", view.battle.PR, true);
	} else {
		fill_cell("ER", view.battle.CR, true);
		fill_cell("EA", view.battle.CA, false);
		fill_cell("EB", view.battle.CB, false);
		fill_cell("EC", view.battle.CC, false);
		fill_cell("ED", view.battle.CD, false);
		fill_cell("FA", view.battle.PA, false);
		fill_cell("FB", view.battle.PB, false);
		fill_cell("FC", view.battle.PC, false);
		fill_cell("FD", view.battle.PD, false);
		fill_cell("FR", view.battle.PR, true);
	}
}

function update_card_display(element, card, prior_card) {
	if (!card && !prior_card) {
		element.className = "show card card_back";
	} else if (prior_card) {
		element.className = "show card prior card_" + CARDS[prior_card].image;
	} else {
		element.className = "show card card_" + CARDS[card].image;
	}
}

function update_cards() {
	update_card_display(document.getElementById("caesar_card"), view.c_card, view.prior_c_card);
	update_card_display(document.getElementById("pompeius_card"), view.p_card, view.prior_p_card);

	for (let c = 1; c <= 27; ++c) {
		let element = ui.cards[c];
		if (view.hand.includes(c)) {
			element.classList.add("show");
			if (view.actions && view.actions.card) {
				if (view.actions.card.includes(c)) {
					element.classList.add("enabled");
					element.classList.remove("disabled");
				} else {
					element.classList.remove("enabled");
					element.classList.add("disabled");
				}
			} else {
				element.classList.remove("enabled");
				element.classList.remove("disabled");
			}
		} else {
			element.classList.remove("show");
		}
	}

	let n = view.hand.length;
	for (let c = 1; c <= 6; ++c)
		if (c <= n && player === 'Observer')
			ui.card_backs[c].classList.add("show");
		else
			ui.card_backs[c].classList.remove("show");
}

function on_update() {
	if (!ui.old_steps) {
		ui.old_steps = view.steps;
		ui.old_location = view.location;
	}

	document.getElementById("turn").className = "year_" + view.year;
	document.getElementById("caesar_vp").textContent = view.c_vp + " VP";
	document.getElementById("pompeius_vp").textContent = view.p_vp + " VP";
	if (view.turn < 1)
		document.getElementById("turn_info").textContent = `Year ${view.year}`;
	else
		document.getElementById("turn_info").textContent = `Turn ${view.turn} of Year ${view.year}`;

	action_button("surprise", "Surprise!");
	action_button("pass");
	action_button("undo", "Undo");

	update_cards();
	update_map();

	if (view.battle) {
		document.getElementById("battle_header").textContent = view.battle.title;
		document.getElementById("battle_message").textContent = view.battle.flash;
		document.getElementById("battle").classList.add("show");
		update_battle();
	} else {
		document.getElementById("battle").classList.remove("show");
	}

	ui.old_location = Object.assign({}, view.location);
	ui.old_steps = Object.assign({}, view.steps);
}

function select_card(c) {
	send_action('card', c);
}

build_map();

document.getElementById("blocks").classList.add(label_style+'-labels');
document.getElementById("battle").classList.add(label_style+'-labels');

drag_element_with_mouse("#battle", "#battle_header");
scroll_with_middle_mouse("main");
