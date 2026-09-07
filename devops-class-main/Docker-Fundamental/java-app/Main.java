import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;

public class Main {
    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);

        server.createContext("/", exchange -> {
            String response = """
                    <h1>Hello World from Java + Docker!</h1>
                    <p><strong>Name:</strong> Palak Agrawal</p>
                    <p><strong>Roll No:</strong> 24BCS10504</p>
                    """;

            exchange.sendResponseHeaders(200, response.getBytes().length);

            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        });

        server.start();
        System.out.println("Java server running on port 8080");
    }
}
