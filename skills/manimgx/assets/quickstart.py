import manimgx as m


class SquareToCircle(m.Scene):
    def construct(self) -> None:
        title = m.Text("Square to circle", font_size=48).to_edge(m.UP)
        square = m.Square(side_length=3, color=m.BLUE, fill_opacity=0.5)
        circle = m.Circle(radius=1.6, color=m.PINK, fill_opacity=0.5)
        self.play(m.Write(title), m.Create(square))
        self.play(m.Transform(square, circle))
        self.wait()
