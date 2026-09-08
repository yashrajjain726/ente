package io.ente.ensu.notes

import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class NotesMaintenanceGateTest {
    @Test
    fun concurrentSuspensionEitherFindsOrPreventsTheRun() {
        val executor = Executors.newFixedThreadPool(2)
        try {
            val gate = NotesMaintenanceGate<Any>()
            val run = Any()
            val start = CyclicBarrier(2)
            val admission = executor.submit<Boolean> {
                start.await(5, TimeUnit.SECONDS)
                gate.admit(run)
            }
            val suspension = executor.submit<Any?> {
                start.await(5, TimeUnit.SECONDS)
                gate.suspend()
            }

            if (admission.get(5, TimeUnit.SECONDS)) {
                assertSame(run, suspension.get(5, TimeUnit.SECONDS))
            } else {
                assertNull(suspension.get(5, TimeUnit.SECONDS))
            }
            gate.finish(run)
            assertFalse(gate.available)
            gate.resume()
            assertTrue(gate.available)
        } finally {
            executor.shutdownNow()
        }
    }
}
