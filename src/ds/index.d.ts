/** A numbered point: a square-ish number cell beside a white content card with a brand-coloured title and a soft description. Sized for the 1080px social-post canvas. */
export interface NumberedCardProps {
  /** The number shown in the left cell (1, 2, 3…). */
  number?: number | string;
  /** Title, in brand violet, Semibold 46/58. Keep to one line (≈ 30 characters). */
  title?: string;
  /** One or two lines in ink-soft, 32/42. */
  description?: string;
  /** Extra content under the description. */
  children?: React.ReactNode;
  className?: string;
}
export declare function NumberedCard(props: NumberedCardProps): JSX.Element;

export interface NumberedCardListProps {
  /** Cards in order; `number` defaults to the position (1-based). */
  items: Array<{ number?: number | string; title: string; description?: string }>;
}
/** A vertical stack of NumberedCards with the 24px gap from the post. */
export declare function NumberedCardList(props: NumberedCardListProps): JSX.Element;

export type IconName = 'arrow-up-right' | 'arrow-right' | 'mail' | 'globe' | 'music' | 'map';
/** Outline icon from juandaza.design: 24px grid, 1.5 stroke, round caps; draws in currentColor. */
export interface IconProps { name: IconName; /** px, default 20 */ size?: number; /** Set when the icon carries meaning alone. */ label?: string; className?: string; }
export declare function Icon(props: IconProps): JSX.Element;

/** The pill button. `primary` = brand-fill violet; `inverse` = the dark pill used on violet or light grounds. */
export interface ButtonProps {
  variant?: 'primary' | 'inverse';
  /** md = 46px (nav, review cards); lg = 58px (hero, testimonial). */
  size?: 'md' | 'lg';
  /** Leading icon; the site always pairs a label with one. */
  icon?: IconName;
  /** Renders an <a> when set. */
  href?: string;
  external?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}
export declare function Button(props: ButtonProps): JSX.Element;

/** Glass pill navigation: logo on the left, text links and one primary CTA on the right. */
export interface NavBarProps {
  /** Use the jd-monogram asset (JD on the white pill). Falls back to a text monogram. */
  logoSrc?: string; logoAlt?: string; logoHref?: string;
  links: Array<{ label: string; href: string; /** Adds the arrow-up-right and opens a new tab. */ external?: boolean }>;
  cta?: { label: string; href: string; icon?: IconName };
  label?: string;
}
export declare function NavBar(props: NavBarProps): JSX.Element;

/** A bento tile: optional icon top-left, arrow top-right when linked, a two-line title pinned to the bottom. */
export interface BentoCardProps {
  /** tile = light grey · dark = surface-inverse · highlight = yellow · brand = violet */
  tone?: 'tile' | 'dark' | 'highlight' | 'brand';
  /** First line, full strength. */
  title?: React.ReactNode;
  /** Second line, faded (ink-faint / on-inverse-muted / highlight-ink / on-brand-fill-muted). */
  subtitle?: React.ReactNode;
  icon?: IconName;
  /** Makes the whole card a link and shows the arrow. */
  href?: string;
  /** px or CSS length; default min-height 212px. */
  height?: number | string;
  /** Free content between the top row and the title (a player, an image). */
  children?: React.ReactNode;
  className?: string;
}
export declare function BentoCard(props: BentoCardProps): JSX.Element;

/** The violet welcome card: eyebrow, a lead where <Em> words are bright and the rest lavender, and a dark pill CTA. */
export interface HeroCardProps { eyebrow?: string; children: React.ReactNode; action?: { label: string; href: string; icon?: IconName }; className?: string; }
export declare function HeroCard(props: HeroCardProps): JSX.Element;
/** Bright words inside HeroCard or TestimonialCard text. */
export declare function Em(props: { children: React.ReactNode }): JSX.Element;

/** A recommendation quote on a dark card, with author and an optional "view all" CTA. */
export interface TestimonialCardProps { children: React.ReactNode; name: string; role?: string; avatarSrc?: string; action?: { label: string; href: string }; className?: string; }
export declare function TestimonialCard(props: TestimonialCardProps): JSX.Element;

/** A third-party product review: mono overline, quote, a "View full review" pill and a source logo slot. */
export interface ReviewCardProps { label?: string; children: React.ReactNode; href?: string; actionLabel?: string; /** e.g. the Gartner Peer Insights logo. */ source?: React.ReactNode; className?: string; }
export declare function ReviewCard(props: ReviewCardProps): JSX.Element;

/** Section title (section-title) with a muted body-lg subtitle. */
export interface SectionHeaderProps { title: React.ReactNode; subtitle?: React.ReactNode; level?: 1 | 2 | 3; align?: 'start' | 'center'; className?: string; }
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;

/** Article rows: list-title text, arrow-up-right, a hairline between rows. */
export interface LinkListProps { items: Array<{ title: string; href: string; /** default true: opens in a new tab */ external?: boolean }>; className?: string; }
export declare function LinkList(props: LinkListProps): JSX.Element;

/** A violet case-study card: product screenshot inset 16px, title over a violet fade. */
export interface CaseStudyCardProps { title: React.ReactNode; imageSrc?: string; imageAlt?: string; href?: string; children?: React.ReactNode; className?: string; }
export declare function CaseStudyCard(props: CaseStudyCardProps): JSX.Element;

/** The big bold statement; words light up with `progress` (0–1), for a scroll-driven reveal. */
export interface StatementProps { text: string; progress?: number; className?: string; }
export declare function Statement(props: StatementProps): JSX.Element;

/** A yellow pill label (highlight ground, ink text, Projekt Blackbird). One or two words, lowercase. */
export interface TagProps {
  /** highlight = yellow-300 + ink (default) · ink = carousel-ink + white · soft = carousel-highlight + carousel-ink. */
  tone?: 'highlight' | 'ink' | 'soft';
  /** lg = the social carousel tag (40px type, 80px tall, from template-post.pdf) · md = derived UI size (18px type, 32px tall). Default md. */
  size?: 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}
export declare function Tag(props: TagProps): JSX.Element;

/** The social carousel template (template-post.pdf): a 1231 x 1731 slide with a grey card holding a tag, optional meta, a two-colour title, a summary and one visual, and a footer with the JD mark, handle and "Swipe". */
export interface CarouselCardProps {
  /** Topic tag, top-left (rendered as <Tag size="lg">). */
  tag?: React.ReactNode;
  /** Optional top-right note, max two lines; pass an array to set the line break. */
  meta?: React.ReactNode | string[];
  /** Title line 1, in ink. */
  title: React.ReactNode;
  /** Title line 2, in brand-fill violet. Keep the two-colour split. */
  titleAccent?: React.ReactNode;
  /** Summary, max 3 lines (clamped). Always the same size and line-height. */
  summary?: React.ReactNode;
  /** Footer handle. Default "@jpdazab". */
  handle?: string;
  /** Right footer label. Default "Swipe"; pass false on the last slide. */
  swipe?: string | false;
  /** JD mark; defaults to the jd-monogram-bare asset. */
  logoSrc?: string;
  /** The visual: a chart, image or CarouselVenn, centred in the remaining card space (≈ 1071 x 760). */
  children?: React.ReactNode;
  label?: string;
  className?: string;
}
export declare function CarouselCard(props: CarouselCardProps): JSX.Element;

/** Two-set Venn sized for CarouselCard: white sets, brand-fill overlap, Blackbird 56px labels. Use \n to break a label. */
export interface CarouselVennProps { left?: string; overlap?: string; right?: string;
  /** brand = brand-fill overlap (template-post) · highlight = pale-yellow overlap, electric-blue label (Template-4). */ tone?: 'brand' | 'highlight';
  /** Set diameter in px; default 634, 660 in Template-4. */ diameter?: number; }
export declare function CarouselVenn(props: CarouselVennProps): JSX.Element;

/** The JD mark from the carousel PDFs, in currentColor. */
export interface JDMarkProps { /** px, default 38 */ height?: number; label?: string; className?: string; }
export declare function JDMark(props: JDMarkProps): JSX.Element;

interface SlideBaseProps {
  /** Topic tag, top-left. */
  tag?: React.ReactNode;
  /** Top-right note, max two lines; an array sets the break. */
  meta?: React.ReactNode | string[];
  /** Footer handle. Default "@jpdazab". */
  handle?: string;
  /** Right footer label. Default "Swipe"; false on the last slide. */
  swipe?: string | false;
  label?: string;
  className?: string;
}
/** Carousel cover, 1231 x 1731 (Cover_Main / Cover_black / Cover_black-1 / Cover_yellow.pdf). */
export interface CoverCardProps extends SlideBaseProps {
  /** grey = Cover_Main · ink = Cover_black · blue = Cover_black-1 · yellow = Cover_yellow. Default grey. */
  tone?: 'grey' | 'ink' | 'blue' | 'yellow';
  /** Max three lines at 109px; one word may be wrapped in <u>. */
  title: React.ReactNode;
  /** Max three lines. The yellow cover has none in the source. */
  summary?: React.ReactNode;
}
export declare function CoverCard(props: CoverCardProps): JSX.Element;

/** Inner carousel slide, 1231 x 1731 (frame of Template-1..7). */
export interface SlideCardProps extends SlideBaseProps {
  /** Title line 1, carousel-ink. */
  title: React.ReactNode;
  /** Title line 2, carousel-accent. */
  titleAccent?: React.ReactNode;
  /** Max three lines, always 40/49. */
  summary?: React.ReactNode;
  /** One visual, 991px wide: StatGrid, ComparisonBars, CarouselVenn, CarouselImage or ProgressBars. */
  children?: React.ReactNode;
}
export declare function SlideCard(props: SlideCardProps): JSX.Element;

export interface StatCardProps { value: React.ReactNode; label?: React.ReactNode; tone?: 'white' | 'ink' | 'blue' | 'yellow'; /** Relative width inside a row. */ grow?: number; className?: string; }
/** A 221px number tile (Template-1/2). */
export declare function StatCard(props: StatCardProps): JSX.Element;
/** Rows of StatCards, 24px gaps. */
export interface StatGridProps { rows: Array<Array<StatCardProps>>; className?: string; }
export declare function StatGrid(props: StatGridProps): JSX.Element;

/** Two bars per row (Template-3): a in carousel-accent, b in white, on a shared 606px scale. */
export interface ComparisonBarsProps { items: Array<{ label: React.ReactNode; a: number; b: number; aLabel?: React.ReactNode; bLabel?: React.ReactNode }>; /** Scale max; default the largest value. */ max?: number; className?: string; }
export declare function ComparisonBars(props: ComparisonBarsProps): JSX.Element;

/** Label + 606x78 track + fill + value (Template-6 brand, Template-7 highlight). */
export interface ProgressBarsProps { items: Array<{ label: React.ReactNode; value: number; display?: React.ReactNode }>; max?: number; tone?: 'brand' | 'highlight'; className?: string; }
export declare function ProgressBars(props: ProgressBarsProps): JSX.Element;

/** Image slot, 991 x 637 (Template-5); grey placeholder when src is empty. */
export interface CarouselImageProps { src?: string; alt?: string; placeholder?: string; height?: number; className?: string; }
export declare function CarouselImage(props: CarouselImageProps): JSX.Element;

/** A swipeable, scroll-snapping row of slide cards, scaled; the last slide drops "Swipe". */
export interface CarouselProps { children: React.ReactNode; /** Default 0.3. */ scale?: number; /** px between slides, default 24. */ gap?: number; label?: string; className?: string; }
export declare function Carousel(props: CarouselProps): JSX.Element;
