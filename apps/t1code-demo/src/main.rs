use std::{
    cell::{Cell, RefCell},
    io,
    rc::Rc,
};

use ratzilla::{
    backend::webgl2::{WebGl2Backend, WebGl2BackendOptions},
    event::{KeyCode, KeyEvent, MouseButton, MouseEvent, MouseEventKind},
    ratatui::{
        layout::{Alignment, Constraint, Layout, Rect},
        prelude::{Color, Frame, Line, Modifier, Span, Style, Text, Widget},
        widgets::{Block, BorderType, Borders, Clear, List, ListItem, Padding, Paragraph, Wrap},
        Terminal,
    },
    WebRenderer,
};

const SIDEBAR_WIDTH: u16 = 28;
const COMPOSER_HEIGHT: u16 = 7;
const FOOTER_HEIGHT: u16 = 0;
const MAX_VISIBLE_PROMPTS: usize = 4;
const WELCOME_CARD_ROW: u16 = 7;
const WELCOME_CARD_GAP: u16 = 1;
const WELCOME_CARDS: &[(&str, u16)] = &[
    ("  Create", 11),
    ("  Explore", 12),
    ("  Code", 10),
    ("  Learn", 11),
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum FocusArea {
    Threads,
    Timeline,
    Composer,
    Controls,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ThinkingMode {
    Fast,
    Think,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MainView {
    Thread,
    Settings,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ThemeChoice {
    Light,
    System,
    Dark,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ModelChoice {
    Gpt54,
    Gpt5Mini,
    Claude,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Popover {
    None,
    Model,
    Thinking,
    Settings,
    SidebarSettings,
    QuickAction(usize),
}

#[derive(Clone, Copy)]
struct DemoPalette {
    accent: Color,
    new_chat_bg: Color,
    composer_border: Color,
    send_active: Color,
    control_active: Color,
    text: Color,
    muted: Color,
    subtle: Color,
    divider: Color,
    page_bg: Color,
    sidebar_bg: Color,
    panel_bg: Color,
    surface: Color,
    surface_alt: Color,
}

const DARK_PALETTE: DemoPalette = DemoPalette {
    accent: Color::Rgb(227, 63, 134),
    new_chat_bg: Color::Rgb(162, 59, 103),
    composer_border: Color::Rgb(163, 0, 76),
    send_active: Color::Rgb(163, 0, 76),
    control_active: Color::Rgb(57, 37, 56),
    text: Color::Rgb(249, 248, 251),
    muted: Color::Rgb(180, 159, 181),
    subtle: Color::Rgb(134, 117, 135),
    divider: Color::Rgb(57, 37, 56),
    page_bg: Color::Rgb(31, 21, 29),
    sidebar_bg: Color::Rgb(24, 15, 23),
    panel_bg: Color::Rgb(31, 21, 29),
    surface: Color::Rgb(39, 25, 37),
    surface_alt: Color::Rgb(46, 31, 44),
};

const LIGHT_PALETTE: DemoPalette = DemoPalette {
    accent: Color::Rgb(202, 2, 119),
    new_chat_bg: Color::Rgb(162, 59, 103),
    composer_border: Color::Rgb(227, 63, 134),
    send_active: Color::Rgb(227, 63, 134),
    control_active: Color::Rgb(230, 204, 233),
    text: Color::Rgb(80, 24, 84),
    muted: Color::Rgb(122, 63, 126),
    subtle: Color::Rgb(154, 107, 158),
    divider: Color::Rgb(224, 184, 220),
    page_bg: Color::Rgb(242, 225, 244),
    sidebar_bg: Color::Rgb(234, 208, 239),
    panel_bg: Color::Rgb(253, 247, 253),
    surface: Color::Rgb(255, 255, 255),
    surface_alt: Color::Rgb(245, 234, 246),
};

const BORING_DARK_PALETTE: DemoPalette = DemoPalette {
    accent: Color::Rgb(173, 82, 115),
    new_chat_bg: Color::Rgb(162, 59, 103),
    composer_border: Color::Rgb(118, 55, 80),
    send_active: Color::Rgb(118, 55, 80),
    control_active: Color::Rgb(42, 42, 42),
    text: Color::Rgb(230, 230, 230),
    muted: Color::Rgb(176, 176, 176),
    subtle: Color::Rgb(112, 112, 112),
    divider: Color::Rgb(40, 40, 40),
    page_bg: Color::Rgb(21, 21, 21),
    sidebar_bg: Color::Rgb(26, 26, 26),
    panel_bg: Color::Rgb(21, 21, 21),
    surface: Color::Rgb(30, 30, 30),
    surface_alt: Color::Rgb(34, 34, 34),
};

const BORING_LIGHT_PALETTE: DemoPalette = DemoPalette {
    accent: Color::Rgb(173, 82, 115),
    new_chat_bg: Color::Rgb(162, 59, 103),
    composer_border: Color::Rgb(173, 82, 115),
    send_active: Color::Rgb(173, 82, 115),
    control_active: Color::Rgb(212, 212, 212),
    text: Color::Rgb(23, 23, 23),
    muted: Color::Rgb(86, 86, 86),
    subtle: Color::Rgb(128, 128, 128),
    divider: Color::Rgb(208, 208, 208),
    page_bg: Color::Rgb(235, 235, 235),
    sidebar_bg: Color::Rgb(224, 224, 224),
    panel_bg: Color::Rgb(240, 240, 240),
    surface: Color::Rgb(255, 255, 255),
    surface_alt: Color::Rgb(232, 232, 232),
};

thread_local! {
    static ACTIVE_PALETTE: Cell<DemoPalette> = const { Cell::new(DARK_PALETTE) };
}

struct DemoState {
    sidebar_open: bool,
    active_thread: Option<usize>,
    focus: FocusArea,
    composer: String,
    sent_prompt: Option<String>,
    turn_count: usize,
    temporary_chat: bool,
    thinking_mode: ThinkingMode,
    model_choice: ModelChoice,
    main_view: MainView,
    theme_choice: ThemeChoice,
    boring_mode: bool,
    profile_create_open: bool,
    last_button_down: Option<(u16, u16)>,
    popover: Popover,
    viewport: Rect,
}

impl Default for DemoState {
    fn default() -> Self {
        Self {
            sidebar_open: true,
            active_thread: None,
            focus: FocusArea::Composer,
            composer: String::new(),
            sent_prompt: None,
            turn_count: 0,
            temporary_chat: false,
            thinking_mode: ThinkingMode::Think,
            model_choice: ModelChoice::Gpt54,
            main_view: MainView::Thread,
            theme_choice: ThemeChoice::System,
            boring_mode: false,
            profile_create_open: false,
            last_button_down: None,
            popover: Popover::None,
            viewport: Rect::new(0, 0, 0, 0),
        }
    }
}

impl DemoState {
    fn handle_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char(c) if !key.ctrl && !key.alt && self.focus == FocusArea::Composer => {
                self.composer.push(c);
            }
            KeyCode::Char('b') | KeyCode::Char('B') => self.sidebar_open = !self.sidebar_open,
            KeyCode::Char('n') | KeyCode::Char('N') => self.start_new_chat(),
            KeyCode::Char('t') | KeyCode::Char('T') => self.temporary_chat = !self.temporary_chat,
            KeyCode::Char('m') | KeyCode::Char('M') => self.toggle_thinking_mode(),
            KeyCode::Esc => {
                self.profile_create_open = false;
                self.popover = Popover::None;
                if self.main_view == MainView::Settings {
                    self.main_view = MainView::Thread;
                }
            }
            KeyCode::Tab => self.next_focus(),
            KeyCode::Backspace => {
                self.composer.pop();
            }
            KeyCode::Enter => self.send_demo_turn(),
            KeyCode::Up => self.select_relative_thread(-1),
            KeyCode::Down => self.select_relative_thread(1),
            KeyCode::Char(c) => {
                if !key.ctrl && !key.alt {
                    self.focus = FocusArea::Composer;
                    self.composer.push(c);
                }
            }
            _ => {}
        }
    }

    fn handle_mouse(&mut self, event: MouseEvent) {
        match event.kind {
            MouseEventKind::ButtonDown(MouseButton::Left) => {
                self.last_button_down = Some((event.col, event.row));
            }
            MouseEventKind::SingleClick(MouseButton::Left) => {
                if self.last_button_down == Some((event.col, event.row)) {
                    self.last_button_down = None;
                    return;
                }
            }
            _ => return,
        }

        let layout = AppLayout::from_area(self.viewport, self.sidebar_open);

        if self.handle_popover_click(&layout, event.col, event.row) {
            return;
        }

        if let Some(sidebar) = layout.sidebar {
            if contains(sidebar, event.col, event.row) {
                self.focus = FocusArea::Threads;
                self.handle_sidebar_click(sidebar, event.col, event.row);
                return;
            }
        }

        if contains(layout.footer, event.col, event.row) {
            self.handle_footer_click(event.col);
            return;
        }

        if contains(layout.header, event.col, event.row) {
            self.handle_header_click(layout.header, event.col);
            return;
        }

        if self.main_view == MainView::Settings {
            let settings = settings_view_area(&layout);
            if contains(settings, event.col, event.row) {
                self.handle_settings_view_click(settings, event.col, event.row);
            }
            return;
        }

        if contains(layout.composer, event.col, event.row) {
            self.handle_composer_click(layout.composer, event.col, event.row);
            return;
        }

        if contains(layout.content, event.col, event.row) {
            self.focus = FocusArea::Timeline;
            if self.active_thread.is_none() {
                self.handle_welcome_click(timeline_inner(layout.content), event.col, event.row);
            }
        }
    }

    fn handle_sidebar_click(&mut self, sidebar: Rect, col: u16, row: u16) {
        if row >= sidebar.y.saturating_add(sidebar.height.saturating_sub(4)) {
            self.focus = FocusArea::Controls;
            if col >= sidebar.x.saturating_add(10) {
                self.popover = Popover::SidebarSettings;
            }
            return;
        }

        let inner_x = sidebar.x + 1;
        if row == sidebar.y + 3
            && col >= inner_x
            && col < sidebar.x + sidebar.width.saturating_sub(1)
        {
            self.start_new_chat();
            return;
        }

        if row == sidebar.y + 5 {
            self.composer.clear();
            self.focus = FocusArea::Composer;
            return;
        }

        if let Some(index) = thread_index_for_sidebar_row(row) {
            self.active_thread = Some(index);
            self.sent_prompt = None;
            self.focus = FocusArea::Timeline;
        }
    }

    fn handle_footer_click(&mut self, col: u16) {
        self.focus = FocusArea::Controls;
        match col {
            0..=17 => self.sidebar_open = !self.sidebar_open,
            18..=35 => self.start_new_chat(),
            36..=54 => self.temporary_chat = !self.temporary_chat,
            55..=72 => self.toggle_thinking_mode(),
            _ => {}
        }
    }

    fn handle_composer_click(&mut self, composer: Rect, col: u16, row: u16) {
        self.focus = FocusArea::Composer;
        let toolbar_y = composer.y.saturating_add(composer.height.saturating_sub(2));

        if row >= toolbar_y.saturating_sub(1) {
            self.focus = FocusArea::Controls;
            if col >= composer.x.saturating_add(composer.width.saturating_sub(8)) {
                self.popover = Popover::None;
                self.send_demo_turn();
            } else if col < composer.x.saturating_add(16) {
                self.popover = Popover::Model;
            } else if col < composer.x.saturating_add(30) {
                self.popover = Popover::Thinking;
            } else {
                self.popover = Popover::None;
            }
            return;
        }

        self.popover = Popover::None;
    }

    fn handle_header_click(&mut self, header: Rect, col: u16) {
        self.focus = FocusArea::Controls;
        if col >= header.x.saturating_add(header.width.saturating_sub(4)) {
            self.popover = Popover::Settings;
        } else if col >= header.x.saturating_add(header.width.saturating_sub(8)) {
            self.temporary_chat = !self.temporary_chat;
            self.popover = Popover::None;
        } else {
            self.popover = Popover::None;
        }
    }

    fn handle_settings_view_click(&mut self, area: Rect, _col: u16, row: u16) {
        self.focus = FocusArea::Controls;
        match row.saturating_sub(area.y) {
            5 => self.cycle_theme(),
            6 => self.boring_mode = !self.boring_mode,
            10 => self.temporary_chat = !self.temporary_chat,
            13 => self.cycle_model(),
            17 => self.main_view = MainView::Thread,
            _ => {}
        }
    }

    fn handle_welcome_click(&mut self, content: Rect, col: u16, row: u16) {
        for (index, rect) in welcome_card_rects(content) {
            if contains(rect, col, row) {
                self.focus = FocusArea::Controls;
                self.popover = Popover::QuickAction(index);
                return;
            }
        }

        let relative_row = row.saturating_sub(content.y);
        let prompt_start = welcome_prompt_start(content.width);
        if relative_row >= prompt_start
            && relative_row < prompt_start + MAX_VISIBLE_PROMPTS as u16 * 2
        {
            let prompt_index = ((relative_row - prompt_start) / 2) as usize;
            if let Some(prompt) = PROMPTS.get(prompt_index) {
                self.composer = (*prompt).to_string();
                self.focus = FocusArea::Composer;
                self.popover = Popover::None;
            }
        }
    }

    fn handle_popover_click(&mut self, layout: &AppLayout, col: u16, row: u16) -> bool {
        let Some(rect) = popover_rect(layout, self.popover) else {
            return false;
        };

        if !contains(rect, col, row) {
            if self.popover != Popover::None {
                if self.popover == Popover::SidebarSettings {
                    self.profile_create_open = false;
                }
                self.popover = Popover::None;
            }
            return false;
        }

        let relative_popover_row = row.saturating_sub(rect.y);

        match self.popover {
            Popover::Model => {
                match relative_popover_row {
                    1 => self.model_choice = ModelChoice::Gpt54,
                    2 => self.model_choice = ModelChoice::Claude,
                    3..=5 => {}
                    _ => {}
                }
                if matches!(relative_popover_row, 1..=5) {
                    self.popover = Popover::None;
                }
            }
            Popover::Thinking => {
                match relative_popover_row {
                    2..=5 | 8 => self.thinking_mode = ThinkingMode::Think,
                    9 => self.thinking_mode = ThinkingMode::Fast,
                    _ => {}
                }
                if matches!(relative_popover_row, 2..=5 | 8..=9) {
                    self.popover = Popover::None;
                }
            }
            Popover::Settings => match relative_popover_row {
                1 => {
                    let rel_col = col.saturating_sub(rect.x);
                    self.theme_choice = match rel_col {
                        0..=12 => ThemeChoice::Light,
                        13..=15 => ThemeChoice::System,
                        _ => ThemeChoice::Dark,
                    };
                }
                2 | 3 => {
                    self.boring_mode = !self.boring_mode;
                }
                4 | 5 => {
                    self.main_view = MainView::Settings;
                    self.popover = Popover::None;
                    self.focus = FocusArea::Controls;
                }
                _ => {}
            },
            Popover::SidebarSettings => {
                let relative_row = relative_popover_row;
                if self.profile_create_open {
                    if relative_row == 5 {
                        self.profile_create_open = false;
                        self.popover = Popover::None;
                    }
                } else if matches!(relative_row, 2 | 3) {
                    self.profile_create_open = true;
                }
            }
            Popover::QuickAction(index) => {
                if relative_popover_row >= 2 {
                    self.composer = quick_action_prompt(index).to_string();
                    self.focus = FocusArea::Composer;
                    self.popover = Popover::None;
                }
            }
            Popover::None => {}
        }

        true
    }

    fn start_new_chat(&mut self) {
        self.main_view = MainView::Thread;
        self.active_thread = None;
        self.sent_prompt = None;
        self.turn_count = 0;
        self.composer.clear();
        self.focus = FocusArea::Composer;
    }

    fn send_demo_turn(&mut self) {
        let prompt = self.composer.trim().to_string();
        if prompt.is_empty() {
            return;
        }

        self.sent_prompt = Some(prompt);
        self.turn_count += 1;
        self.active_thread = None;
        self.composer.clear();
        self.focus = FocusArea::Composer;
        self.popover = Popover::None;
    }

    fn select_relative_thread(&mut self, delta: i8) {
        let current = self.active_thread.unwrap_or(0);
        let next = if delta < 0 {
            current.saturating_sub(1)
        } else {
            (current + 1).min(THREADS.len() - 1)
        };
        self.active_thread = Some(next);
        self.sent_prompt = None;
        self.focus = FocusArea::Threads;
    }

    fn toggle_thinking_mode(&mut self) {
        self.thinking_mode = match self.thinking_mode {
            ThinkingMode::Fast => ThinkingMode::Think,
            ThinkingMode::Think => ThinkingMode::Fast,
        };
    }

    fn cycle_model(&mut self) {
        self.model_choice = match self.model_choice {
            ModelChoice::Gpt54 => ModelChoice::Gpt5Mini,
            ModelChoice::Gpt5Mini => ModelChoice::Claude,
            ModelChoice::Claude => ModelChoice::Gpt54,
        };
    }

    fn cycle_theme(&mut self) {
        self.theme_choice = match self.theme_choice {
            ThemeChoice::Light => ThemeChoice::System,
            ThemeChoice::System => ThemeChoice::Dark,
            ThemeChoice::Dark => ThemeChoice::Light,
        };
    }

    fn model_label(&self) -> &'static str {
        match self.model_choice {
            ModelChoice::Gpt54 => "GPT-5.4",
            ModelChoice::Gpt5Mini => "GPT-5 mini",
            ModelChoice::Claude => "Claude",
        }
    }

    fn theme_label(&self) -> &'static str {
        match self.theme_choice {
            ThemeChoice::Light => "Light",
            ThemeChoice::System => "System",
            ThemeChoice::Dark => "Dark",
        }
    }

    fn palette(&self) -> DemoPalette {
        if self.boring_mode {
            return match self.theme_choice {
                ThemeChoice::Light => BORING_LIGHT_PALETTE,
                ThemeChoice::System | ThemeChoice::Dark => BORING_DARK_PALETTE,
            };
        }

        match self.theme_choice {
            ThemeChoice::Light => LIGHT_PALETTE,
            ThemeChoice::System | ThemeChoice::Dark => DARK_PALETTE,
        }
    }

    fn next_focus(&mut self) {
        self.focus = match self.focus {
            FocusArea::Threads => FocusArea::Timeline,
            FocusArea::Timeline => FocusArea::Composer,
            FocusArea::Composer => FocusArea::Controls,
            FocusArea::Controls => FocusArea::Threads,
        };
    }
}

struct ThreadItem {
    title: &'static str,
    group: &'static str,
    preview: &'static str,
}

struct AppLayout {
    sidebar: Option<Rect>,
    header: Rect,
    content: Rect,
    composer: Rect,
    footer: Rect,
}

impl AppLayout {
    fn from_area(area: Rect, sidebar_open: bool) -> Self {
        let [app_area, footer] =
            Layout::vertical([Constraint::Min(0), Constraint::Length(FOOTER_HEIGHT)]).areas(area);
        let body_chunks = if sidebar_open && app_area.width > SIDEBAR_WIDTH + 42 {
            Layout::horizontal([Constraint::Length(SIDEBAR_WIDTH), Constraint::Min(0)])
                .split(app_area)
        } else {
            Layout::horizontal([Constraint::Min(0)]).split(app_area)
        };

        let (sidebar, main) = if body_chunks.len() == 2 {
            (Some(body_chunks[0]), body_chunks[1])
        } else {
            (None, body_chunks[0])
        };

        let header = Rect {
            x: main.x,
            y: main.y,
            width: main.width,
            height: 3.min(main.height),
        };
        let composer_y = main
            .y
            .saturating_add(main.height.saturating_sub(COMPOSER_HEIGHT));
        let composer = Rect {
            x: main.x.saturating_add(1),
            y: composer_y,
            width: main.width.saturating_sub(2),
            height: COMPOSER_HEIGHT,
        };
        let content_y = main.y.saturating_add(header.height);
        let content = Rect {
            x: main.x,
            y: content_y,
            width: main.width,
            height: composer.y.saturating_sub(content_y),
        };

        Self {
            sidebar,
            header,
            content,
            composer,
            footer,
        }
    }
}

const THREADS: &[ThreadItem] = &[
    ThreadItem {
        title: "Count Rs in strawberry",
        group: "Today",
        preview: "There are three Rs in strawberry.",
    },
    ThreadItem {
        title: "New thread",
        group: "Today",
        preview: "A blank chat ready for the next idea.",
    },
    ThreadItem {
        title: "New thread",
        group: "Today",
        preview: "Saved conversation placeholder.",
    },
    ThreadItem {
        title: "New thread",
        group: "Today",
        preview: "Another recent thread.",
    },
];

const PROMPTS: &[&str] = &[
    "How does AI work?",
    "Are black holes real?",
    "How many Rs are in the word \"strawberry\"?",
    "What is the meaning of life?",
];

fn main() -> io::Result<()> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));

    let state = Rc::new(RefCell::new(DemoState::default()));
    let backend = WebGl2Backend::new_with_options(
        WebGl2BackendOptions::new()
            .disable_auto_css_resize()
            .canvas_padding_color(page_bg()),
    )?;
    let mut terminal = Terminal::new(backend)?;

    terminal.on_key_event({
        let state = state.clone();
        move |key| state.borrow_mut().handle_key(key)
    })?;

    terminal.on_mouse_event({
        let state = state.clone();
        move |event| state.borrow_mut().handle_mouse(event)
    })?;

    terminal.draw_web(move |frame| {
        let mut state = state.borrow_mut();
        draw(frame, &mut state);
    });

    Ok(())
}

fn draw(frame: &mut Frame<'_>, state: &mut DemoState) {
    let area = frame.area();
    state.viewport = area;
    set_active_palette(state);
    sync_overlay_state(state);
    Clear.render(area, frame.buffer_mut());
    frame.render_widget(Block::new().style(Style::default().bg(page_bg())), area);

    let layout = AppLayout::from_area(area, state.sidebar_open);
    if let Some(sidebar) = layout.sidebar {
        draw_sidebar(frame, sidebar, state);
    }

    draw_main_header(frame, layout.header, state);
    if layout.sidebar.is_none() {
        draw_compact_header(frame, layout.header);
    }

    if state.main_view == MainView::Settings {
        draw_settings_view(frame, settings_view_area(&layout), state);
    } else {
        draw_timeline(frame, layout.content, state);
        draw_composer(frame, layout.composer, state);
    }

    draw_footer(frame, layout.footer, state);
    draw_popover(frame, &layout, state);
}

fn draw_sidebar(frame: &mut Frame<'_>, area: Rect, state: &DemoState) {
    let block = Block::new().style(Style::default().bg(sidebar_bg()));
    frame.render_widget(block, area);

    let inner = Rect {
        x: area.x + 1,
        y: area.y,
        width: area.width.saturating_sub(2),
        height: area.height,
    };

    let [header, new_chat, search, threads, actions] = Layout::vertical([
        Constraint::Length(3),
        Constraint::Length(2),
        Constraint::Length(3),
        Constraint::Min(8),
        Constraint::Length(4),
    ])
    .areas(inner);

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "T1 Chat",
                Style::default().fg(text()).add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled(" ALPHA ", Style::default().fg(muted()).bg(surface_alt())),
        ]))
        .alignment(Alignment::Center),
        Rect {
            y: header.y.saturating_add(1),
            height: 1,
            ..header
        },
    );

    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            "New Chat",
            Style::default()
                .fg(Color::Rgb(255, 255, 255))
                .add_modifier(Modifier::BOLD),
        )))
        .alignment(Alignment::Center)
        .style(
            Style::default()
                .fg(Color::Rgb(255, 255, 255))
                .bg(new_chat_bg()),
        ),
        Rect {
            x: new_chat.x,
            y: new_chat.y,
            width: new_chat.width,
            height: 1,
        },
    );

    let search_text = Line::from(vec![
        Span::raw("  "),
        Span::styled("Search ", Style::default().fg(text())),
        Span::styled("your threads...", Style::default().fg(muted())),
    ]);
    frame.render_widget(
        Paragraph::new(search_text).style(Style::default().bg(sidebar_bg())),
        search,
    );

    let mut rows = Vec::new();
    let mut last_group = "";
    for (index, thread) in THREADS.iter().enumerate() {
        if thread.group != last_group {
            rows.push(ListItem::new(Line::from(Span::styled(
                thread.group,
                Style::default().fg(muted()),
            ))));
            last_group = thread.group;
        }
        rows.push(thread_row(
            index,
            state.active_thread == Some(index),
            thread,
        ));
    }

    frame.render_widget(List::new(rows), threads);

    let profile_icon = Rect {
        x: actions.x + actions.width.saturating_sub(16),
        y: actions.y.saturating_add(1),
        width: 3,
        height: 3.min(actions.height.saturating_sub(1)),
    };
    frame.render_widget(
        Block::new().style(Style::default().fg(text()).bg(control_active())),
        profile_icon,
    );
}

fn draw_compact_header(frame: &mut Frame<'_>, area: Rect) {
    let [brand, _] = Layout::horizontal([Constraint::Length(20), Constraint::Min(0)]).areas(area);
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                " T1 Chat",
                Style::default().fg(text()).add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled(" ALPHA ", Style::default().fg(muted()).bg(surface_alt())),
        ])),
        brand,
    );
}

fn draw_main_header(frame: &mut Frame<'_>, area: Rect, _state: &DemoState) {
    let top_band = Rect {
        y: area.y.saturating_add(1),
        height: area.height.saturating_sub(1),
        width: area.width.saturating_sub(8),
        ..area
    };
    let controls = Rect {
        x: area.x.saturating_add(area.width.saturating_sub(8)),
        y: area.y.saturating_add(1),
        width: 8.min(area.width),
        height: 1,
        ..area
    };
    frame.render_widget(
        Block::new().style(Style::default().bg(panel_bg())),
        top_band,
    );
    frame.render_widget(
        Paragraph::new(" ")
            .alignment(Alignment::Center)
            .style(Style::default().bg(panel_bg())),
        controls,
    );
}

fn draw_timeline(frame: &mut Frame<'_>, area: Rect, state: &DemoState) {
    let block = Block::new()
        .borders(Borders::RIGHT)
        .border_style(if state.focus == FocusArea::Timeline {
            Style::default().fg(accent())
        } else {
            Style::default().fg(divider())
        })
        .style(Style::default().bg(panel_bg()))
        .padding(Padding::horizontal(3));
    frame.render_widget(block, area);
    let inner = timeline_inner(area);

    if state.active_thread.is_none() && state.sent_prompt.is_none() {
        draw_welcome(frame, inner, state);
        return;
    }

    let lines = if let Some(prompt) = &state.sent_prompt {
        sent_chat_lines(prompt, state.turn_count)
    } else {
        let active = state.active_thread.unwrap_or(0);
        thread_chat_lines(&THREADS[active])
    };

    frame.render_widget(
        Paragraph::new(Text::from(lines))
            .wrap(Wrap { trim: false })
            .style(Style::default().fg(text()).bg(panel_bg())),
        inner,
    );
}

fn draw_welcome(frame: &mut Frame<'_>, area: Rect, state: &DemoState) {
    let status = if state.temporary_chat {
        Line::from(Span::styled(
            "  Temporary chat",
            Style::default().fg(accent()).bg(panel_bg()),
        ))
    } else {
        Line::from(Span::styled(
            "How can I help you?",
            Style::default().fg(text()).bg(panel_bg()),
        ))
    };

    frame.render_widget(
        Paragraph::new(status).style(Style::default().bg(panel_bg())),
        Rect {
            y: area.y.saturating_add(5),
            height: 1,
            ..area
        },
    );

    for (index, card) in welcome_card_rects(area) {
        let label = WELCOME_CARDS[index].0;
        frame.render_widget(
            Block::bordered()
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(divider()))
                .style(Style::default().bg(surface_alt())),
            card,
        );
        frame.render_widget(
            Paragraph::new(label)
                .alignment(Alignment::Center)
                .style(Style::default().fg(text()).bg(surface_alt())),
            Rect {
                x: card.x.saturating_add(1),
                y: card.y.saturating_add(1),
                width: card.width.saturating_sub(2),
                height: 1,
            },
        );
    }

    let prompt_y = area.y.saturating_add(welcome_prompt_start(area.width));
    for (index, prompt) in PROMPTS.iter().take(MAX_VISIBLE_PROMPTS).enumerate() {
        let y = prompt_y.saturating_add(index as u16 * 2);
        frame.render_widget(
            Paragraph::new(truncate(prompt, area.width.saturating_sub(1) as usize))
                .style(Style::default().fg(muted()).bg(panel_bg())),
            Rect {
                y,
                height: 1,
                ..area
            },
        );
        frame.render_widget(
            Paragraph::new("─".repeat(area.width as usize))
                .style(Style::default().fg(divider()).bg(panel_bg())),
            Rect {
                y: y.saturating_add(1),
                height: 1,
                ..area
            },
        );
    }
}

fn draw_settings_view(frame: &mut Frame<'_>, area: Rect, state: &DemoState) {
    let block = Block::new()
        .borders(Borders::RIGHT)
        .border_style(Style::default().fg(divider()))
        .style(Style::default().bg(panel_bg()))
        .padding(Padding::horizontal(3));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let lines = vec![
        Line::from(""),
        Line::from(Span::styled(
            "Settings",
            Style::default()
                .fg(text())
                .bg(panel_bg())
                .add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
        settings_section("General"),
        settings_row("Mode", "T1 Chat", false),
        settings_row("Theme", state.theme_label(), true),
        settings_row(
            "Theme preset",
            if state.boring_mode {
                "Boring"
            } else {
                "Default"
            },
            true,
        ),
        settings_row("Assistant responses", "Streaming", false),
        settings_row("Thread workspace", "Local", false),
        settings_row("Confirm thread delete", "Enabled", false),
        settings_row("Temporary chat", bool_label(state.temporary_chat), true),
        Line::from(""),
        settings_section("Models"),
        settings_row("Text generation model", state.model_label(), true),
        Line::from(""),
        settings_section("Advanced"),
        settings_row("Keybindings", "Open file", false),
        settings_row("Back to thread", "Return", true),
    ];

    frame.render_widget(
        Paragraph::new(Text::from(lines))
            .wrap(Wrap { trim: false })
            .style(Style::default().fg(text()).bg(panel_bg())),
        inner,
    );
}

fn settings_view_area(layout: &AppLayout) -> Rect {
    Rect {
        x: layout.content.x,
        y: layout.content.y,
        width: layout.content.width,
        height: layout
            .composer
            .y
            .saturating_add(layout.composer.height)
            .saturating_sub(layout.content.y),
    }
}

fn settings_section(label: &'static str) -> Line<'static> {
    Line::from(Span::styled(
        label,
        Style::default()
            .fg(muted())
            .bg(panel_bg())
            .add_modifier(Modifier::BOLD),
    ))
}

fn settings_row(label: &'static str, value: &'static str, actionable: bool) -> Line<'static> {
    let marker = if actionable { "> " } else { "  " };
    Line::from(vec![
        Span::styled(marker, Style::default().fg(accent()).bg(panel_bg())),
        Span::styled(
            format!("{label:<24}"),
            Style::default()
                .fg(if actionable { text() } else { muted() })
                .bg(panel_bg()),
        ),
        Span::styled(
            value.to_string(),
            Style::default().fg(text()).bg(panel_bg()),
        ),
    ])
}

fn timeline_inner(area: Rect) -> Rect {
    Rect {
        x: area.x.saturating_add(3),
        y: area.y,
        width: area.width.saturating_sub(7),
        height: area.height,
    }
}

fn welcome_card_rects(area: Rect) -> Vec<(usize, Rect)> {
    let mut rects = Vec::new();
    let mut x = area.x;
    let mut y = area.y.saturating_add(WELCOME_CARD_ROW);
    let right = area.x.saturating_add(area.width);

    for (index, &(_, width)) in WELCOME_CARDS.iter().enumerate() {
        if x > area.x && x.saturating_add(width) > right {
            x = area.x;
            y = y.saturating_add(3);
        }
        rects.push((
            index,
            Rect {
                x,
                y,
                width,
                height: 3,
            },
        ));
        x = x.saturating_add(width).saturating_add(WELCOME_CARD_GAP);
    }

    rects
}

fn welcome_prompt_start(width: u16) -> u16 {
    WELCOME_CARD_ROW
        .saturating_add(welcome_card_rows(width).saturating_mul(3))
        .saturating_add(2)
}

fn welcome_card_rows(width: u16) -> u16 {
    let mut rows: u16 = 1;
    let mut used: u16 = 0;
    for &(_, card_width) in WELCOME_CARDS {
        let next_width = if used == 0 {
            card_width
        } else {
            used.saturating_add(WELCOME_CARD_GAP)
                .saturating_add(card_width)
        };
        if used > 0 && next_width > width {
            rows = rows.saturating_add(1);
            used = card_width;
        } else {
            used = next_width;
        }
    }
    rows
}

fn draw_composer(frame: &mut Frame<'_>, area: Rect, state: &DemoState) {
    let border_style = if state.focus == FocusArea::Composer {
        Style::default().fg(composer_border())
    } else {
        Style::default().fg(divider())
    };
    let block = Block::new()
        .borders(Borders::TOP | Borders::LEFT | Borders::RIGHT)
        .border_type(BorderType::Rounded)
        .border_style(border_style)
        .style(Style::default().bg(surface()));
    frame.render_widget(block, area);

    let input_area = Rect {
        x: area.x.saturating_add(2),
        y: area.y.saturating_add(2),
        width: area.width.saturating_sub(4),
        height: area.height.saturating_sub(4),
    };
    let toolbar_area = Rect {
        x: area.x.saturating_add(3),
        y: area.y.saturating_add(area.height.saturating_sub(2)),
        width: area.width.saturating_sub(6),
        height: 1,
    };

    let composer_text = if state.composer.is_empty() {
        Text::from(Line::from(Span::styled(
            "Type your message here...",
            Style::default().fg(muted()),
        )))
    } else {
        Text::from(Line::from(Span::styled(
            state.composer.as_str(),
            Style::default().fg(text()),
        )))
    };

    frame.render_widget(
        Paragraph::new(composer_text)
            .wrap(Wrap { trim: false })
            .style(Style::default().fg(text()).bg(surface())),
        input_area,
    );

    let toolbar_clear_style = Style::default().fg(muted()).bg(surface());
    let [model, separator, mode, _, _send_slot] = Layout::horizontal([
        Constraint::Length(14),
        Constraint::Length(3),
        Constraint::Length(10),
        Constraint::Min(0),
        Constraint::Length(5),
    ])
    .areas(toolbar_area);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(" ", toolbar_clear_style)))
            .style(toolbar_clear_style),
        model,
    );
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            " ",
            Style::default().bg(surface()),
        )))
        .style(Style::default().bg(surface())),
        separator,
    );
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(" ", toolbar_clear_style)))
            .style(toolbar_clear_style),
        mode,
    );
    let send_bg = if state.composer.trim().is_empty() {
        surface_alt()
    } else {
        send_active()
    };
    let send = Rect {
        x: area.x.saturating_add(area.width.saturating_sub(8)),
        y: area.y.saturating_add(area.height.saturating_sub(3)),
        width: 5.min(area.width.saturating_sub(2)),
        height: 2.min(area.height.saturating_sub(2)),
    };
    frame.render_widget(
        Block::new().style(Style::default().fg(text()).bg(send_bg)),
        send,
    );
}

fn draw_footer(frame: &mut Frame<'_>, area: Rect, _state: &DemoState) {
    if area.height == 0 {
        return;
    }

    frame.render_widget(Block::new().style(Style::default().bg(page_bg())), area);
}

fn draw_popover(frame: &mut Frame<'_>, layout: &AppLayout, state: &DemoState) {
    let Some(area) = popover_rect(layout, state.popover) else {
        return;
    };

    Clear.render(area, frame.buffer_mut());
    if matches!(state.popover, Popover::Model | Popover::Thinking) {
        frame.render_widget(Block::new().style(Style::default().bg(surface_alt())), area);
        let inner = Rect {
            x: area.x.saturating_add(2),
            y: area.y.saturating_add(1),
            width: area.width.saturating_sub(4),
            height: area.height.saturating_sub(2),
        };
        let lines = match state.popover {
            Popover::Model => model_menu_lines(state),
            Popover::Thinking => thinking_menu_lines(state),
            _ => Vec::new(),
        };
        frame.render_widget(
            Paragraph::new(Text::from(lines))
                .wrap(Wrap { trim: false })
                .style(Style::default().bg(surface_alt())),
            inner,
        );
        if state.popover == Popover::Model {
            frame.render_widget(
                Paragraph::new(Text::from(vec![
                    Line::from(Span::styled("│", Style::default().fg(subtle()))),
                    Line::from(Span::styled("│", Style::default().fg(subtle()))),
                    Line::from(Span::styled("│", Style::default().fg(subtle()))),
                    Line::from(Span::styled("│", Style::default().fg(subtle()))),
                    Line::from(Span::styled("│", Style::default().fg(subtle()))),
                ]))
                .style(Style::default().bg(surface_alt())),
                Rect {
                    x: area.x.saturating_add(area.width.saturating_sub(4)),
                    y: area.y.saturating_add(1),
                    width: 1,
                    height: area.height.saturating_sub(2),
                },
            );
        }
        return;
    }

    let title = match state.popover {
        Popover::Model => " model ",
        Popover::Thinking => " effort ",
        Popover::Settings => " chat ",
        Popover::SidebarSettings => " profiles ",
        Popover::QuickAction(index) => quick_action_title(index),
        Popover::None => "",
    };

    let block = Block::bordered()
        .title(title)
        .border_style(Style::default().fg(accent()))
        .style(Style::default().bg(surface_alt()));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let lines = match state.popover {
        Popover::Model => model_menu_lines(state),
        Popover::Thinking => thinking_menu_lines(state),
        Popover::Settings => chat_settings_lines(state),
        Popover::SidebarSettings => profile_settings_lines(state),
        Popover::QuickAction(index) => vec![
            Line::from(Span::styled(
                "Choose this mode",
                Style::default().fg(subtle()).bg(surface_alt()),
            )),
            option_line(quick_action_prompt(index), false),
        ],
        Popover::None => Vec::new(),
    };

    frame.render_widget(
        Paragraph::new(Text::from(lines))
            .wrap(Wrap { trim: false })
            .style(Style::default().bg(surface_alt())),
        inner,
    );
}

fn popover_rect(layout: &AppLayout, popover: Popover) -> Option<Rect> {
    match popover {
        Popover::None => None,
        Popover::Model => Some(Rect {
            x: layout.composer.x.saturating_add(3),
            y: layout.composer.y.saturating_sub(8),
            width: 40.min(layout.composer.width.saturating_sub(6)),
            height: 8,
        }),
        Popover::Thinking => Some(Rect {
            x: layout.composer.x.saturating_add(24),
            y: layout.composer.y.saturating_sub(11),
            width: 44.min(layout.composer.width.saturating_sub(28)),
            height: 11,
        }),
        Popover::Settings => Some(Rect {
            x: layout
                .header
                .x
                .saturating_add(layout.header.width.saturating_sub(31)),
            y: layout.header.y.saturating_add(3),
            width: 30,
            height: 6,
        }),
        Popover::SidebarSettings => layout.sidebar.map(|sidebar| Rect {
            x: sidebar.x.saturating_add(3),
            y: sidebar.y.saturating_add(sidebar.height.saturating_sub(12)),
            width: sidebar.width.saturating_sub(5),
            height: 8,
        }),
        Popover::QuickAction(index) => {
            let content = timeline_inner(layout.content);
            welcome_card_rects(content)
                .into_iter()
                .find(|(card_index, _)| *card_index == index)
                .map(|(_, card)| Rect {
                    x: card.x,
                    y: card.y.saturating_add(3),
                    width: 24.min(content.width),
                    height: 5,
                })
        }
    }
}

fn chat_settings_lines(_state: &DemoState) -> Vec<Line<'static>> {
    vec![
        blank_popover_line(),
        blank_popover_line(),
        blank_popover_line(),
        blank_popover_line(),
    ]
}

fn profile_settings_lines(state: &DemoState) -> Vec<Line<'static>> {
    if state.profile_create_open {
        return vec![
            Line::from(Span::styled(
                "Create a Profile",
                Style::default()
                    .fg(text())
                    .bg(surface_alt())
                    .add_modifier(Modifier::BOLD),
            )),
            Line::from(Span::styled(
                "Separate threads",
                Style::default().fg(subtle()).bg(surface_alt()),
            )),
            Line::from(vec![
                Span::styled(" Icon ", Style::default().fg(muted()).bg(surface_alt())),
                Span::styled("Default", Style::default().fg(text()).bg(surface_alt())),
            ]),
            Line::from(Span::styled(
                "Name  Default",
                Style::default().fg(muted()).bg(surface_alt()),
            )),
            option_line("Create Profile", false),
        ];
    }

    vec![
        Line::from(Span::styled(
            "Default profile",
            Style::default()
                .fg(text())
                .bg(surface_alt())
                .add_modifier(Modifier::BOLD),
        )),
        option_line("T1 Chat", true),
        option_line("Create profile", false),
    ]
}

fn model_menu_lines(state: &DemoState) -> Vec<Line<'static>> {
    vec![
        menu_line("  Codex", state.model_choice == ModelChoice::Gpt54, false),
        menu_line("  Claude", state.model_choice == ModelChoice::Claude, false),
        menu_line("  Cursor                 Soon", false, true),
        menu_line("  OpenCode               Soon", false, true),
        menu_line("  Gemini                 Soon", false, true),
    ]
}

fn thinking_menu_lines(state: &DemoState) -> Vec<Line<'static>> {
    vec![
        section_line("Reasoning"),
        menu_line("  Extra High", false, false),
        menu_line("  High (default)", false, false),
        menu_line("  Medium", false, false),
        menu_line("  Low", state.thinking_mode == ThinkingMode::Think, false),
        blank_popover_line(),
        section_line("Fast Mode"),
        menu_line("  Off", state.thinking_mode == ThinkingMode::Think, false),
        menu_line("  On", state.thinking_mode == ThinkingMode::Fast, false),
    ]
}

fn section_line(label: &'static str) -> Line<'static> {
    Line::from(Span::styled(
        label,
        Style::default().fg(muted()).bg(surface_alt()),
    ))
}

fn menu_line(label: &str, active: bool, disabled: bool) -> Line<'static> {
    let padded_label = format!("{label:<34}");
    let style = Style::default()
        .fg(if disabled {
            subtle()
        } else if active {
            text()
        } else {
            muted()
        })
        .bg(if active {
            control_active()
        } else {
            surface_alt()
        })
        .add_modifier(if active {
            Modifier::BOLD
        } else {
            Modifier::empty()
        });
    Line::from(Span::styled(padded_label, style))
}

fn blank_popover_line() -> Line<'static> {
    Line::from(Span::styled(
        " ".repeat(26),
        Style::default().bg(surface_alt()),
    ))
}

fn option_line(label: &str, active: bool) -> Line<'static> {
    let prefix = if active { "> " } else { "  " };
    Line::from(vec![
        Span::styled(prefix, Style::default().fg(accent()).bg(surface_alt())),
        Span::styled(
            label.to_string(),
            Style::default().fg(text()).bg(surface_alt()),
        ),
    ])
}

fn bool_label(enabled: bool) -> &'static str {
    if enabled {
        "On"
    } else {
        "Off"
    }
}

fn quick_action_title(index: usize) -> &'static str {
    match index {
        0 => " create ",
        1 => " explore ",
        2 => " code ",
        3 => " learn ",
        _ => " action ",
    }
}

fn quick_action_prompt(index: usize) -> &'static str {
    match index {
        0 => "Create a concise project plan",
        1 => "Explore an idea from first principles",
        2 => "Write a small code example",
        3 => "Teach me the key concept",
        _ => "Start a new thread with a prompt",
    }
}

fn sync_overlay_state(state: &DemoState) {
    let view_class = if state.main_view == MainView::Settings {
        "is-settings"
    } else if state.main_view == MainView::Thread
        && state.active_thread.is_none()
        && state.sent_prompt.is_none()
    {
        "is-welcome"
    } else {
        "is-chat"
    };

    let theme_class = match state.theme_choice {
        ThemeChoice::Light => "theme-light",
        ThemeChoice::System => "theme-system",
        ThemeChoice::Dark => "theme-dark",
    };
    let boring_class = if state.boring_mode {
        "boring-on"
    } else {
        "boring-off"
    };
    let popover_class = match state.popover {
        Popover::Model => "popover-model",
        Popover::Thinking => "popover-thinking",
        Popover::Settings => "popover-chat-settings",
        Popover::SidebarSettings => "popover-profiles",
        _ => "popover-none",
    };
    let profile_class = if state.profile_create_open {
        "profile-create-open"
    } else {
        "profile-create-closed"
    };
    let composer_class = if state.composer.trim().is_empty() {
        "composer-empty"
    } else {
        "composer-filled"
    };
    let temporary_class = if state.temporary_chat {
        "temporary-on"
    } else {
        "temporary-off"
    };
    let thinking_class = match state.thinking_mode {
        ThinkingMode::Fast => "thinking-fast",
        ThinkingMode::Think => "thinking-low",
    };
    let model_class = match state.model_choice {
        ModelChoice::Gpt54 => "model-gpt54",
        ModelChoice::Gpt5Mini => "model-gpt5m",
        ModelChoice::Claude => "model-claude",
    };
    let class_name = format!(
        "{view_class} {theme_class} {boring_class} {popover_class} {profile_class} {composer_class} {temporary_class} {thinking_class} {model_class}"
    );

    if let Some(window) = ratzilla::web_sys::window() {
        if let Some(document) = window.document() {
            if let Some(body) = document.body() {
                body.set_class_name(&class_name);
            }
        }
    }
}

fn thread_row(_index: usize, active: bool, thread: &ThreadItem) -> ListItem<'static> {
    let style = if active {
        Style::default()
            .fg(text())
            .bg(surface_alt())
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(muted())
    };
    ListItem::new(Line::from(Span::styled(truncate(thread.title, 25), style)))
}

fn thread_chat_lines(thread: &ThreadItem) -> Vec<Line<'static>> {
    vec![
        role_line("user", "  10:42 AM", accent()),
        Line::from(match thread.title {
            "Count Rs in strawberry" => "How many Rs are in the word \"strawberry\"?",
            "New thread" => "Start a new thread with a prompt.",
            _ => "Can you help me think this through?",
        }),
        Line::from(""),
        role_line("assistant", "  10:43 AM", accent()),
        Line::from(thread.preview),
        Line::from(""),
        Line::from("The short answer is visible in the conversation, with the context"),
        Line::from("kept nearby so you can continue from the same thread later."),
        Line::from(""),
        Line::from(Span::styled(
            "Ready for the next prompt.",
            Style::default().fg(muted()),
        )),
    ]
}

fn sent_chat_lines(prompt: &str, turn_count: usize) -> Vec<Line<'static>> {
    vec![
        role_line("user", "  just now", accent()),
        Line::from(prompt.to_string()),
        Line::from(""),
        role_line("assistant", "  streaming", accent()),
        Line::from(format!("Demo turn {turn_count}: I can work with that.")),
        Line::from(""),
        Line::from("Here is a concise answer in the same conversation surface,"),
        Line::from("with the prompt preserved above and the composer ready for"),
        Line::from("the next turn."),
    ]
}

fn role_line<'a>(role: &'a str, time: &'a str, color: Color) -> Line<'a> {
    Line::from(vec![
        Span::styled(
            role,
            Style::default().fg(color).add_modifier(Modifier::BOLD),
        ),
        Span::styled(time, Style::default().fg(subtle())),
    ])
}

fn thread_index_for_sidebar_row(row: u16) -> Option<usize> {
    match row {
        9 => Some(0),
        10 => Some(1),
        11 => Some(2),
        12 => Some(3),
        _ => None,
    }
}

fn contains(rect: Rect, x: u16, y: u16) -> bool {
    x >= rect.x
        && x < rect.x.saturating_add(rect.width)
        && y >= rect.y
        && y < rect.y.saturating_add(rect.height)
}

fn set_active_palette(state: &DemoState) {
    ACTIVE_PALETTE.with(|palette| palette.set(state.palette()));
}

fn palette_color(select: impl FnOnce(DemoPalette) -> Color) -> Color {
    ACTIVE_PALETTE.with(|palette| select(palette.get()))
}

fn accent() -> Color {
    palette_color(|palette| palette.accent)
}

fn new_chat_bg() -> Color {
    palette_color(|palette| palette.new_chat_bg)
}

fn composer_border() -> Color {
    palette_color(|palette| palette.composer_border)
}

fn send_active() -> Color {
    palette_color(|palette| palette.send_active)
}

fn control_active() -> Color {
    palette_color(|palette| palette.control_active)
}

fn text() -> Color {
    palette_color(|palette| palette.text)
}

fn muted() -> Color {
    palette_color(|palette| palette.muted)
}

fn subtle() -> Color {
    palette_color(|palette| palette.subtle)
}

fn divider() -> Color {
    palette_color(|palette| palette.divider)
}

fn page_bg() -> Color {
    palette_color(|palette| palette.page_bg)
}

fn sidebar_bg() -> Color {
    palette_color(|palette| palette.sidebar_bg)
}

fn panel_bg() -> Color {
    palette_color(|palette| palette.panel_bg)
}

fn surface() -> Color {
    palette_color(|palette| palette.surface)
}

fn surface_alt() -> Color {
    palette_color(|palette| palette.surface_alt)
}

fn truncate(input: &str, max_width: usize) -> String {
    if input.chars().count() <= max_width {
        return input.to_string();
    }

    if max_width <= 1 {
        return ".".to_string();
    }

    let mut value = input.chars().take(max_width - 1).collect::<String>();
    value.push('.');
    value
}
