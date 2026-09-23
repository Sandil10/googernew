import 'dart:math' show cos, sin;
import 'package:flutter/material.dart';
import '../theme.dart';

/// Shared UI kit — avatar, cards, buttons, list rows, empty states.

class GoogerAvatar extends StatelessWidget {
  final String? url;
  final String name;
  final double size;
  final bool online;
  const GoogerAvatar({this.url, required this.name, this.size = 40, this.online = false});

  @override
  Widget build(BuildContext context) {
    final imageUrl = url?.trim();
    final initials = name.trim().isEmpty
        ? "G"
        : name.trim().split(RegExp(r"\s+")).take(2).map((p) => p[0].toUpperCase()).join();
    final avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: GoogerColors.soft10,
        shape: BoxShape.circle,
        border: Border.all(color: GoogerColors.line),
        image: imageUrl != null && imageUrl.isNotEmpty
            ? DecorationImage(image: NetworkImage(imageUrl), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: imageUrl == null || imageUrl.isEmpty
          ? Text(initials, style: TextStyle(color: GoogerColors.text, fontWeight: FontWeight.w600, fontSize: size * 0.34))
          : null,
    );
    if (!online) return avatar;
    return Stack(children: [
      avatar,
      Positioned(
        right: 1,
        bottom: 1,
        child: Container(
          width: size * 0.26,
          height: size * 0.26,
          decoration: BoxDecoration(
            color: GoogerColors.greenDeep,
            shape: BoxShape.circle,
            border: Border.all(color: GoogerColors.page, width: 2),
          ),
        ),
      ),
    ]);
  }
}

/// Blue scalloped verification seal with a white check —
/// the classic "verified" badge (starburst edge), drawn with a CustomPainter.
class VerifiedBadge extends StatelessWidget {
  final Color color;
  final double size;
  const VerifiedBadge({this.color = const Color(0xFF1D9BF0), this.size = 14});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _VerifiedSealPainter(color),
    );
  }
}

class _VerifiedSealPainter extends CustomPainter {
  final Color color;
  _VerifiedSealPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final outer = size.width / 2;
    final inner = outer * 0.86;
    const points = 12;

    // scalloped seal outline — rounded bumps around the circle
    final path = Path();
    for (int i = 0; i < points * 2; i++) {
      final r = i.isEven ? outer : inner;
      final angle = (i * 3.14159265 / points) - 3.14159265 / 2;
      final p = Offset(
          center.dx + r * cos(angle), center.dy + r * sin(angle));
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        // arc-ish edge: quadratic through the midpoint keeps bumps rounded
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();

    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.95), color],
        ).createShader(Offset.zero & size)
        ..isAntiAlias = true,
    );

    // white check mark
    final check = Path()
      ..moveTo(size.width * 0.30, size.height * 0.52)
      ..lineTo(size.width * 0.45, size.height * 0.66)
      ..lineTo(size.width * 0.72, size.height * 0.36);
    canvas.drawPath(
      check,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.width * 0.11
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..isAntiAlias = true,
    );
  }

  @override
  bool shouldRepaint(covariant _VerifiedSealPainter old) => old.color != color;
}

class GoogerCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final VoidCallback? onTap;
  const GoogerCard({required this.child, this.padding = const EdgeInsets.all(16), this.color, this.onTap});

  @override
  Widget build(BuildContext context) {
    final card = Container(
      decoration: BoxDecoration(
        color: color ?? GoogerColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GoogerColors.border),
      ),
      padding: padding,
      child: child,
    );
    if (onTap == null) return card;
    return InkWell(onTap: onTap, borderRadius: BorderRadius.circular(16), child: card);
  }
}

class SectionTitle extends StatelessWidget {
  final IconData? icon;
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const SectionTitle({this.icon, required this.title, this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 4),
      child: Row(children: [
        if (icon != null) ...[Icon(icon, size: 18, color: GoogerColors.text), const SizedBox(width: 8)],
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall)),
        if (action != null)
          GestureDetector(onTap: onAction, child: Overline(action!, color: GoogerColors.dim)),
      ]),
    );
  }
}

class IconChip extends StatelessWidget {
  final IconData icon;
  final Color? color;
  final Color? bg;
  final double size;
  const IconChip(this.icon, {this.color, this.bg, this.size = 40});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg ?? GoogerColors.soft6,
        borderRadius: BorderRadius.circular(size * 0.3),
        border: Border.all(color: GoogerColors.line),
      ),
      child: Icon(icon, size: size * 0.46, color: color ?? GoogerColors.muted),
    );
  }
}

class GoogerListRow extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool danger;
  const GoogerListRow({
    required this.icon,
    this.iconColor,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(children: [
          IconChip(icon, color: danger ? GoogerColors.red : iconColor, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    color: danger ? GoogerColors.red : GoogerColors.text,
                  )),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(subtitle!, style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
                ),
            ]),
          ),
          trailing ?? const Icon(Icons.chevron_right, size: 18, color: GoogerColors.faint),
        ]),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const EmptyState({required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Opacity(
        opacity: 0.6,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 34, color: GoogerColors.faint),
            const SizedBox(height: 10),
            Overline(title),
            if (subtitle != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(subtitle!, style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
              ),
          ]),
        ),
      ),
    );
  }
}

class Rupee extends StatelessWidget {
  final double amount;
  final double size;
  final Color color;
  const Rupee(this.amount, {this.size = 16, this.color = GoogerColors.text});

  @override
  Widget build(BuildContext context) {
    final display = amount.toStringAsFixed(2).replaceAllMapped(
        RegExp(r"\B(?=(\d{3})+(?!\d))"), (m) => ",");
    return Text("R $display",
        style: TextStyle(color: color, fontSize: size, fontWeight: FontWeight.w600, letterSpacing: -0.3));
  }
}

class ChoiceChipRow extends StatelessWidget {
  final List<String> options;
  final String selected;
  final ValueChanged<String> onSelect;
  const ChoiceChipRow({required this.options, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((opt) {
        final active = opt == selected;
        // handoff PillChip: selected = red fill + white text
        return GestureDetector(
          onTap: () => onSelect(opt),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: active ? GoogerColors.red : GoogerColors.card,
              borderRadius: BorderRadius.circular(999),
              border: active ? null : Border.all(color: GoogerColors.line),
            ),
            child: Text(opt,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  color: active ? Colors.white : GoogerColors.dim,
                )),
          ),
        );
      }).toList(),
    );
  }
}

/// Gradient hero card with ambient glow — CustomPainter (the Skia layer in Flutter).
class GlowCard extends StatelessWidget {
  final double height;
  final Widget child;
  final Color glow;
  const GlowCard({required this.height, required this.child, this.glow = GoogerColors.red});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: GoogerColors.border),
        ),
        child: CustomPaint(painter: _GlowPainter(glow), child: child),
      ),
    );
  }
}

class _GlowPainter extends CustomPainter {
  final Color glow;
  _GlowPainter(this.glow);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    // handoff walletCardGradient
    canvas.drawRect(
      rect,
      Paint()..shader = GoogerColors.walletCardGradient.createShader(rect),
    );
    final glowPaint = Paint()
      ..color = glow.withValues(alpha: 0.16)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 40);
    canvas.drawCircle(Offset(size.width * 0.85, -size.height * 0.2), size.height * 0.55, glowPaint);
    canvas.drawCircle(
      Offset(size.width * 0.08, size.height * 1.05),
      size.height * 0.4,
      Paint()
        ..color = glow.withValues(alpha: 0.10)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 36),
    );
  }

  @override
  bool shouldRepaint(covariant _GlowPainter old) => old.glow != glow;
}

class StatusPill extends StatelessWidget {
  final String text;
  final Color color;
  const StatusPill(this.text, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text.toUpperCase(),
          style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: color)),
    );
  }
}

/// Segmented loading spinner — 12 rounded bars fading around the circle,
/// stepping like the classic Lottie/iOS activity indicator.
class GoogerSpinner extends StatefulWidget {
  final double size;
  final Color color;
  const GoogerSpinner({super.key, this.size = 28, this.color = GoogerColors.muted});

  @override
  State<GoogerSpinner> createState() => _GoogerSpinnerState();
}

class _GoogerSpinnerState extends State<GoogerSpinner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900))
    ..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) => CustomPaint(
        size: Size(widget.size, widget.size),
        painter: _SpinnerPainter(
            color: widget.color,
            step: (_controller.value * 12).floor() % 12),
      ),
    );
  }
}

class _SpinnerPainter extends CustomPainter {
  final Color color;
  final int step;
  _SpinnerPainter({required this.color, required this.step});

  @override
  void paint(Canvas canvas, Size size) {
    const bars = 12;
    final center = Offset(size.width / 2, size.height / 2);
    final barLength = size.height * 0.28;
    final barWidth = size.width * 0.09;
    final radius = size.height / 2 - barLength / 2;

    for (int i = 0; i < bars; i++) {
      // trailing fade behind the active bar
      final distance = (i - step) % bars;
      final opacity = 1.0 - (distance / bars) * 0.85;
      final angle = (i * 2 * 3.14159265 / bars) - 3.14159265 / 2;
      canvas.save();
      canvas.translate(
          center.dx + radius * cos(angle), center.dy + radius * sin(angle));
      canvas.rotate(angle + 3.14159265 / 2);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
              center: Offset.zero, width: barWidth, height: barLength),
          Radius.circular(barWidth / 2),
        ),
        Paint()..color = color.withValues(alpha: opacity.clamp(0.15, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _SpinnerPainter old) =>
      old.step != step || old.color != color;
}

/// Two-dot options button (replaces the three-dot menu icon).
class TwoDotsIcon extends StatelessWidget {
  final Color color;
  final double dotSize;
  const TwoDotsIcon({super.key, this.color = GoogerColors.dim, this.dotSize = 3.5});

  @override
  Widget build(BuildContext context) {
    Widget dot() => Container(
          width: dotSize,
          height: dotSize,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        );
    return Row(mainAxisSize: MainAxisSize.min, children: [
      dot(),
      SizedBox(width: dotSize),
      dot(),
    ]);
  }
}
