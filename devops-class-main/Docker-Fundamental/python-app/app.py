from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello():
    return """
    <h1>Hello World from Python + Docker!</h1>
    <p><strong>Name:</strong> Palak Agrawal</p>
    <p><strong>Roll No:</strong> 24BCS10504</p>
    """


app.run(host="0.0.0.0", port=5000)
